import { httpErrors } from '@fastify/sensible'
import { resolve } from 'node:path'

import { resetAdminSecret } from './admin-secret.js'
import { CliModule } from '../cli/cli-engine.js'
import { RpcPluginBuilder, rpc } from '../rpc/rpc.js'
import { AuthStorage } from './storage.js'
import { logout, signin, signup, verifyTempPassword } from './utils.js'
import { z } from 'zod'

const AUTH_RESPONSE_SCHEMA = z.object({ id: z.uuid(), name: z.string(), email: z.email(), tempPassword: z.string() })
const SIGNUP_REQUEST_SCHEMA = z.object({ name: z.string(), email: z.email(), password: z.string() })
const SIGNIN_REQUEST_SCHEMA = z.object({ name: z.string(), password: z.string() })
const EMPTY_REQUEST_SCHEMA = z.object({})
const EMPTY_RESPONSE_SCHEMA = z.object({})

/** Authentication RPC and administrative maintenance integrations. */
export const AUTH_MODULE = {
    /** Create anonymous signup/signin and authenticated logout RPC endpoints. */
    makeRpc(storage: AuthStorage): RpcPluginBuilder {
        return rpc('auth')
            .add({
                v: 1,
                name: 'signup',
                anonimous: true,
                bodySchema: SIGNUP_REQUEST_SCHEMA,
                respSchema: AUTH_RESPONSE_SCHEMA,
                action: (body) => signup(storage, body.name, body.email, body.password)
            })
            .add({
                v: 1,
                name: 'signin',
                anonimous: true,
                bodySchema: SIGNIN_REQUEST_SCHEMA,
                respSchema: AUTH_RESPONSE_SCHEMA,
                action: async (body) => {
                    const response = await signin(storage, body.name, body.password)
                    if (response === null) throw httpErrors.unauthorized()
                    return response
                }
            })
            .add({
                v: 1,
                name: 'logout',
                bodySchema: EMPTY_REQUEST_SCHEMA,
                respSchema: EMPTY_RESPONSE_SCHEMA,
                auth: async (userId, password) => {
                    await verifyTempPassword(storage, userId, password)
                    return { userId, password }
                },
                action: async ({ userId, password }) => {
                    await logout(storage, userId, password)
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
