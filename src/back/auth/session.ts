import { RpcError } from '../rpc/rpc.js'
import { createHash, randomBytes } from 'node:crypto'
import { Binary } from 'mongodb'

import { SESSION_COOKIE_NAME } from './cookies.js'
import { assertSameOrigin, verifyCsrfToken } from './csrf.js'
import type { AuthStorage } from './storage.js'
import { toAuthUser } from './utils.js'
import type { RpcRequestContext } from '../rpc/rpc.js'

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000

export interface AuthenticatedSession {
    user: ReturnType<typeof toAuthUser>
    sessionHash: Binary
    csrfToken: string
}

/** Create a new opaque session; only its one-way hash is persisted. */
export async function createSession(storage: AuthStorage, userId: string) {
    const sessionId = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS)
    const sessionHash = hashSessionId(sessionId)

    await storage.createSession(sessionHash, userId, csrfToken, now, expiresAt)
    return { sessionId, csrfToken }
}

/** Revoke the session currently held by this browser before issuing a replacement. */
export async function revokeCurrentSession(storage: AuthStorage, context: RpcRequestContext): Promise<void> {
    const sessionId = context.request.cookies[SESSION_COOKIE_NAME]
    if (typeof sessionId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
        await storage.deleteSession(hashSessionId(sessionId))
    }
}

/** Authenticate only previously issued session IDs and reject expired or idle sessions. */
export async function authenticateSession(
    storage: AuthStorage,
    context: RpcRequestContext,
    idleTimeoutMs = SESSION_IDLE_TIMEOUT_MS
): Promise<AuthenticatedSession> {
    const sessionId = context.request.cookies[SESSION_COOKIE_NAME]
    if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sessionId)) {
        throw new RpcError(403, 'Forbidden')
    }

    const sessionHash = hashSessionId(sessionId)
    const session = await storage.getSession(sessionHash, new Date(), idleTimeoutMs)
    if (session === null) throw new RpcError(403, 'Forbidden')

    const user = await storage.getUserById(session.userId)
    if (user === null) {
        await storage.deleteSession(sessionHash)
        throw new RpcError(403, 'Forbidden')
    }

    return { user: toAuthUser(user), sessionHash, csrfToken: session.csrfToken }
}

/** Require both same-origin browser requests and a session-bound synchronizer token. */
export async function verifySessionCsrf(storage: AuthStorage, context: RpcRequestContext, session: AuthenticatedSession): Promise<void> {
    assertSameOrigin(context.request)
    const provided = context.request.headers['x-csrf-token']
    if (!verifyCsrfToken(session.csrfToken, provided)) throw new RpcError(403, 'Forbidden')
    await storage.touchSession(session.sessionHash, new Date())
}

/** Require same-origin requests for anonymous auth actions and session bootstrap. */
function hashSessionId(sessionId: string): Binary {
    return new Binary(createHash('sha256').update(sessionId).digest())
}
