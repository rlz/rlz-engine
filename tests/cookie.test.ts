import fastifyCookie from '@fastify/cookie'
import fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { SESSION_COOKIE_NAME, clearSessionCookie, setSessionCookie } from '../src/back/auth/cookies.js'

describe('cookie support', () => {
    it('parses cookies and sets and clears HttpOnly cookies with consistent attributes', async () => {
        const app = fastify()
        await app.register(fastifyCookie)
        app.get('/set', (request, reply) => {
            expect(request.cookies.theme).toBe('dark')
            setSessionCookie(reply, 'opaque-session')
            return {}
        })
        app.get('/clear', (_request, reply) => {
            clearSessionCookie(reply)
            return {}
        })
        await app.ready()

        const set = await app.inject({ method: 'GET', url: '/set', headers: { cookie: 'theme=dark' } })
        expect(set.headers['set-cookie']).toContain(`${SESSION_COOKIE_NAME}=opaque-session`)
        expect(set.headers['set-cookie']).toContain('HttpOnly')
        expect(set.headers['set-cookie']).toContain('Secure')
        expect(set.headers['set-cookie']).toContain('SameSite=Lax')
        expect(set.headers['set-cookie']).toContain('Path=/')
        expect(set.headers['set-cookie']).not.toContain('Domain=')

        const clear = await app.inject({ method: 'GET', url: '/clear' })
        expect(clear.headers['set-cookie']).toContain('Max-Age=0')
        expect(clear.headers['set-cookie']).toContain('Path=/')
        expect(clear.headers['set-cookie']).toContain('Secure')

        await app.close()
    })
})
