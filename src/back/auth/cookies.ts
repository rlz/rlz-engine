import type { CookieSerializeOptions } from '@fastify/cookie'

export const SESSION_COOKIE_NAME = '__Host-session'
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

/** Set the HttpOnly session cookie without a Domain attribute. */
export function setSessionCookie(reply: SessionCookieReply, value: string): void {
    reply.setCookie(SESSION_COOKIE_NAME, value, makeOptions())
}

/** Clear the session cookie using the same path and security attributes used when setting it. */
export function clearSessionCookie(reply: SessionCookieReply): void {
    reply.clearCookie(SESSION_COOKIE_NAME, makeOptions())
}

interface SessionCookieReply {
    setCookie(name: string, value: string, options: CookieSerializeOptions): unknown
    clearCookie(name: string, options: CookieSerializeOptions): unknown
}

function makeOptions(): CookieSerializeOptions {
    return {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS
    }
}
