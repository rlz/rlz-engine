import { httpErrors } from '@fastify/sensible'
import { resolve } from 'node:path'

import { resetAdminSecret } from './admin-secret.js'
import { clearSessionCookie, setSessionCookie } from './cookies.js'
import { assertSameOrigin } from './csrf.js'
import { AuthRateLimiter } from './rate-limit.js'
import {
    authenticateSession,
    createSession,
    revokeCurrentSession,
    SESSION_ABSOLUTE_TIMEOUT_MS,
    SESSION_IDLE_TIMEOUT_MS,
    verifySessionCsrf
} from './session.js'
import { CliModule } from '../cli/cli-engine.js'
import { RpcPluginBuilder, rpc } from '../rpc/rpc.js'
import { AuthStorage } from './storage.js'
import { signin, signup } from './utils.js'
import { z } from 'zod'

const AUTH_RESPONSE_SCHEMA = z.object({ id: z.uuid(), name: z.string(), email: z.email(), csrfToken: z.string() })
const SIGNUP_REQUEST_SCHEMA = z.object({
    name: z.string().min(1).max(64),
    email: z.email().max(254),
    password: z.string().min(12).max(1024)
})
const SIGNIN_REQUEST_SCHEMA = z.object({ name: z.string().min(1).max(64), password: z.string().max(1024) })
const EMPTY_REQUEST_SCHEMA = z.object({})
const EMPTY_RESPONSE_SCHEMA = z.object({})

export interface AuthRpcOptions {
    /** Maximum time without an authenticated request before a session expires. Defaults to 30 minutes. */
    sessionIdleTimeoutMs?: number
}

/** Authentication RPC and administrative maintenance integrations. */
export const AUTH_MODULE = {
    /** Create signup/signin, session restoration, and cookie-authenticated logout RPC endpoints. */
    makeRpc(storage: AuthStorage, options: AuthRpcOptions = {}): RpcPluginBuilder {
        const sessionIdleTimeoutMs = options.sessionIdleTimeoutMs ?? SESSION_IDLE_TIMEOUT_MS
        if (
            !Number.isSafeInteger(sessionIdleTimeoutMs) ||
            sessionIdleTimeoutMs <= 0 ||
            sessionIdleTimeoutMs > SESSION_ABSOLUTE_TIMEOUT_MS
        ) {
            throw new RangeError(`sessionIdleTimeoutMs must be a positive integer no greater than ${SESSION_ABSOLUTE_TIMEOUT_MS}`)
        }

        const rateLimiter = new AuthRateLimiter()

        return rpc('auth')
            .add({
                v: 1,
                name: 'signup',
                anonimous: true,
                bodySchema: SIGNUP_REQUEST_SCHEMA,
                respSchema: EMPTY_RESPONSE_SCHEMA,
                action: async (body, _opts, context) => {
                    assertSameOrigin(context.request)
                    await rateLimiter.run('signup', context.request.ip, async () => {
                        try {
                            await signup(storage, body.name, body.email, body.password)
                        } catch (error) {
                            // Keep a duplicate name indistinguishable from a successful registration.
                            if (!isConflictError(error)) throw error
                        }
                    })
                    return {}
                }
            })
            .add({
                v: 1,
                name: 'signin',
                anonimous: true,
                bodySchema: SIGNIN_REQUEST_SCHEMA,
                respSchema: AUTH_RESPONSE_SCHEMA,
                action: async (body, _opts, context) => {
                    assertSameOrigin(context.request)
                    const response = await rateLimiter.run('signin', context.request.ip, () => signin(storage, body.name, body.password))
                    if (response === null) throw httpErrors.unauthorized()
                    await revokeCurrentSession(storage, context)
                    const session = await createSession(storage, response.id)
                    setSessionCookie(context.reply, session.sessionId)
                    return { ...response, csrfToken: session.csrfToken }
                }
            })
            .add({
                v: 1,
                name: 'session',
                bodySchema: EMPTY_REQUEST_SCHEMA,
                respSchema: AUTH_RESPONSE_SCHEMA,
                cookieAuth: {
                    authenticate: (context) => authenticateSession(storage, context, sessionIdleTimeoutMs),
                    verifyCsrf: async (context, session) => {
                        assertSameOrigin(context.request)
                        await storage.touchSession(session.sessionHash, new Date())
                    }
                },
                action: (session) => ({ ...session.user, csrfToken: session.csrfToken })
            })
            .add({
                v: 1,
                name: 'logout',
                bodySchema: EMPTY_REQUEST_SCHEMA,
                respSchema: EMPTY_RESPONSE_SCHEMA,
                cookieAuth: {
                    authenticate: (context) => authenticateSession(storage, context, sessionIdleTimeoutMs),
                    verifyCsrf: (context, session) => verifySessionCsrf(storage, context, session)
                },
                action: async (session, _body, _opts, context) => {
                    await storage.deleteSession(session.sessionHash)
                    clearSessionCookie(context.reply)
                    return {}
                }
            })
    },
    /** Create the `adm reset-secret` command for the supplied application directory. */
    makeCli(workingDirectory: string | (() => string) = () => process.cwd()): CliModule {
        return {
            name: 'adm',
            description: 'Administrative maintenance commands.',
            commands: {
                'reset-secret': {
                    description:
                        'Generate a keyboard-friendly administrative secret and atomically replace the stored password hash. The plaintext is printed once after the hash is safely written.',
                    handler: async () => {
                        const directory = typeof workingDirectory === 'function' ? workingDirectory() : workingDirectory
                        const secret = await resetAdminSecret(resolve(directory))
                        process.stdout.write(`${secret}\n`)
                    }
                }
            }
        }
    }
}

function isConflictError(error: unknown): boolean {
    return error instanceof Error && 'statusCode' in error && error.statusCode === 409
}
