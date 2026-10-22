import fastifyCookie from '@fastify/cookie'
import sensible from '@fastify/sensible'
import formatsPlugin from 'ajv-formats'
import fastify from 'fastify'
import { Binary } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE_NAME } from '../src/back/auth/cookies.js'
import { AUTH_MODULE } from '../src/back/auth/module.js'
import { SESSION_ABSOLUTE_TIMEOUT_MS } from '../src/back/auth/session.js'
import { registerRpcRoutes } from '../src/back/http/server.js'
import type { AuthStorage } from '../src/back/auth/storage.js'

function getCookiePair(header: string | string[] | undefined): string {
    const cookie = Array.isArray(header) ? header[0] : header
    if (cookie === undefined) throw new Error('Expected a Set-Cookie header')
    return cookie.split(';')[0]!
}

describe('authentication RPC', () => {
    it('creates a cookie session, restores it, and revokes it with CSRF protection', async () => {
        const users: Array<{
            _id: string
            name: string
            email: string
            passwordSalt: Binary
            passwordHash: Binary
            passwordHashVersion: number
        }> = []
        const sessions: Array<{
            userId: string
            sessionHash: Binary
            csrfToken: string
            createdAt: Date
            lastActivityAt: Date
            expiresAt: Date
        }> = []
        let receivedIdleTimeoutMs: number | undefined
        const storage = {
            createUser: async (
                id: string,
                name: string,
                email: string,
                passwordSalt: Binary,
                passwordHash: Binary,
                passwordHashVersion: number
            ) => {
                users.push({ _id: id, name, email, passwordSalt, passwordHash, passwordHashVersion })
            },
            getUser: async (name: string) => users.find((user) => user.name === name) ?? null,
            getUserById: async (id: string) => users.find((user) => user._id === id) ?? null,
            markUserActive: async () => undefined,
            updateLegacyPasswordHash: async () => true,
            createSession: async (sessionHash: Binary, userId: string, csrfToken: string, createdAt: Date, expiresAt: Date) => {
                sessions.push({ userId, sessionHash, csrfToken, createdAt, lastActivityAt: createdAt, expiresAt })
            },
            getSession: async (sessionHash: Binary, now: Date, idleTimeoutMs: number) => {
                receivedIdleTimeoutMs = idleTimeoutMs
                const session = sessions.find((item) => Buffer.from(item.sessionHash.value()).equals(Buffer.from(sessionHash.value())))
                if (
                    session === undefined ||
                    session.expiresAt <= now ||
                    session.lastActivityAt.getTime() <= now.getTime() - idleTimeoutMs
                ) {
                    if (session !== undefined && session.lastActivityAt.getTime() <= now.getTime() - idleTimeoutMs) {
                        sessions.splice(sessions.indexOf(session), 1)
                    }
                    return null
                }
                return session
            },
            touchSession: async (sessionHash: Binary, lastActivityAt: Date) => {
                const session = sessions.find((item) => Buffer.from(item.sessionHash.value()).equals(Buffer.from(sessionHash.value())))
                if (session !== undefined) session.lastActivityAt = lastActivityAt
            },
            deleteSession: async (sessionHash: Binary) => {
                const index = sessions.findIndex((item) => Buffer.from(item.sessionHash.value()).equals(Buffer.from(sessionHash.value())))
                if (index >= 0) sessions.splice(index, 1)
            }
        } as unknown as AuthStorage

        expect(() => AUTH_MODULE.makeRpc(storage, { sessionIdleTimeoutMs: 0 })).toThrow(RangeError)
        expect(() => AUTH_MODULE.makeRpc(storage, { sessionIdleTimeoutMs: SESSION_ABSOLUTE_TIMEOUT_MS + 1 })).toThrow(RangeError)

        const app = fastify({
            ajv: {
                plugins: [
                    (ajv) => {
                        if (ajv.getKeyword('formatMaximum') === undefined) formatsPlugin.default(ajv)
                        if (ajv.formats?.uuid === undefined) {
                            ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
                        }
                        return ajv
                    }
                ]
            }
        })
        await app.register(sensible)
        await app.register(fastifyCookie)
        await registerRpcRoutes(app, [AUTH_MODULE.makeRpc(storage, { sessionIdleTimeoutMs: 60 * 60 * 1000 })], [])
        await app.ready()

        const originHeaders = { origin: 'http://localhost' }
        const rejectedOrigin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signup_v1',
            headers: { origin: 'https://attacker.example' },
            payload: { name: 'Attacker', email: 'attacker@example.com', password: 'secret-password' }
        })
        expect(rejectedOrigin.statusCode).toBe(403)

        const signup = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signup_v1',
            headers: originHeaders,
            payload: { name: 'Alex', email: 'alex@example.com', password: 'secret-password' }
        })
        expect(signup.statusCode).toBe(200)
        expect(signup.json()).toEqual({})
        expect(signup.headers['set-cookie']).toBeUndefined()

        const firstSignin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signin_v1',
            headers: originHeaders,
            payload: { name: 'Alex', password: 'secret-password' }
        })
        expect(firstSignin.statusCode).toBe(200)
        expect(firstSignin.headers['set-cookie']).toContain(`${SESSION_COOKIE_NAME}=`)
        expect(sessions).toHaveLength(1)
        const firstSigninCookie = getCookiePair(firstSignin.headers['set-cookie'])

        const signin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signin_v1',
            headers: { ...originHeaders, cookie: firstSigninCookie },
            payload: { name: 'Alex', password: 'secret-password' }
        })
        expect(signin.statusCode).toBe(200)
        expect(sessions).toHaveLength(1)
        const signedIn = signin.json<{ id: string; csrfToken: string }>()
        const signinCookie = getCookiePair(signin.headers['set-cookie'])
        expect(sessions[0]?.sessionHash.value()).toHaveLength(32)
        expect(Buffer.from(sessions[0]!.sessionHash.value()).equals(Buffer.from(signinCookie.split('=')[1]!))).toBe(false)

        const rotatedSession = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { ...originHeaders, cookie: firstSigninCookie },
            payload: {}
        })
        expect(rotatedSession.statusCode).toBe(403)

        const invalidSignin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signin_v1',
            headers: originHeaders,
            payload: { name: 'missing', password: 'secret-password' }
        })
        expect(invalidSignin.statusCode).toBe(401)

        const session = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { ...originHeaders, cookie: signinCookie },
            payload: {}
        })
        expect(session.statusCode).toBe(200)
        expect(session.json()).toEqual(signedIn)
        expect(receivedIdleTimeoutMs).toBe(60 * 60 * 1000)

        const crossOriginSession = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { origin: 'https://attacker.example', cookie: signinCookie },
            payload: {}
        })
        expect(crossOriginSession.statusCode).toBe(403)

        const invalidLogout = await app.inject({
            method: 'POST',
            url: '/rpc/auth_logout_v1',
            headers: { ...originHeaders, cookie: signinCookie },
            payload: {}
        })
        expect(invalidLogout.statusCode).toBe(403)
        expect(sessions).toHaveLength(1)

        const wrongCsrfLogout = await app.inject({
            method: 'POST',
            url: '/rpc/auth_logout_v1',
            headers: {
                ...originHeaders,
                cookie: signinCookie,
                'x-csrf-token': `${signedIn.csrfToken.slice(0, -1)}${signedIn.csrfToken.endsWith('A') ? 'B' : 'A'}`
            },
            payload: {}
        })
        expect(wrongCsrfLogout.statusCode).toBe(403)
        expect(sessions).toHaveLength(1)

        const logout = await app.inject({
            method: 'POST',
            url: '/rpc/auth_logout_v1',
            headers: { ...originHeaders, cookie: signinCookie, 'x-csrf-token': signedIn.csrfToken },
            payload: {}
        })
        expect(logout.statusCode).toBe(200)
        expect(logout.headers['set-cookie']).toContain('Max-Age=0')
        expect(sessions).toHaveLength(0)

        const expiredSession = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { ...originHeaders, cookie: signinCookie },
            payload: {}
        })
        expect(expiredSession.statusCode).toBe(403)

        const newSignin = await app.inject({
            method: 'POST',
            url: '/rpc/auth_signin_v1',
            headers: originHeaders,
            payload: { name: 'Alex', password: 'secret-password' }
        })
        expect(newSignin.statusCode).toBe(200)
        const newCookie = getCookiePair(newSignin.headers['set-cookie'])
        sessions[0]!.lastActivityAt = new Date(Date.now() - 60 * 60 * 1000 - 1)
        const idleExpiredSession = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { ...originHeaders, cookie: newCookie },
            payload: {}
        })
        expect(idleExpiredSession.statusCode).toBe(403)
        expect(sessions).toHaveLength(0)

        const malformedCookieSession = await app.inject({
            method: 'POST',
            url: '/rpc/auth_session_v1',
            headers: { ...originHeaders, cookie: `${SESSION_COOKIE_NAME}=invalid` },
            payload: {}
        })
        expect(malformedCookieSession.statusCode).toBe(403)
        await app.close()
    })
})
