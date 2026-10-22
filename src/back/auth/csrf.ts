import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import type { RpcRequestContext } from '../rpc/rpc.js'
import { RpcError } from '../rpc/rpc.js'

export const CSRF_TOKEN_HEADER = 'x-csrf-token'

/** Create a secret token suitable for storing with one server-side session. */
export function makeCsrfToken(): string {
    return randomBytes(32).toString('base64url')
}

/** Compare a session's expected CSRF token with the token submitted in a request header. */
export function verifyCsrfToken(expected: string, provided: string | string[] | undefined): boolean {
    if (!/^[A-Za-z0-9_-]{43}$/.test(expected) || typeof provided !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(provided)) {
        return false
    }

    const expectedBytes = Buffer.from(expected)
    const providedBytes = Buffer.from(provided)
    const expectedHash = createHash('sha256').update(expectedBytes).digest()
    const providedHash = createHash('sha256').update(providedBytes).digest()
    return timingSafeEqual(expectedHash, providedHash)
}

/** Reject requests whose browser Origin does not match the request's own origin. */
export function assertSameOrigin(request: Pick<RpcRequestContext['request'], 'headers' | 'protocol'>): void {
    const originHeader = request.headers.origin
    const hostHeader = request.headers.host
    const origin = Array.isArray(originHeader) ? undefined : originHeader
    const host = Array.isArray(hostHeader) ? undefined : hostHeader

    if (origin === undefined || origin === 'null' || host === undefined || !isCanonicalOrigin(origin)) {
        throw new RpcError(403, 'Forbidden')
    }

    try {
        if (new URL(origin).origin !== new URL(`${request.protocol}://${host}`).origin) throw new RpcError(403, 'Forbidden')
    } catch (error) {
        if (error instanceof RpcError) throw error
        throw new RpcError(403, 'Forbidden')
    }
}

function isCanonicalOrigin(value: string): boolean {
    try {
        const parsed = new URL(value)
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin === value
    } catch {
        return false
    }
}
