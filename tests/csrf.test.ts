import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'

import { assertSameOrigin, makeCsrfToken, verifyCsrfToken } from '../src/back/auth/csrf.js'

describe('cookie-auth security helpers', () => {
    it('creates high-entropy CSRF tokens and rejects missing, malformed, or incorrect values', () => {
        const token = makeCsrfToken()
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(verifyCsrfToken(token, token)).toBe(true)
        expect(verifyCsrfToken(token, undefined)).toBe(false)
        expect(verifyCsrfToken(token, 'short')).toBe(false)
        const changedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
        expect(verifyCsrfToken(token, changedToken)).toBe(false)
    })

    it('allows only the request host and protocol as the browser origin', () => {
        const request = (origin: string | undefined, host = 'app.example.com', protocol: 'http' | 'https' = 'https') =>
            ({ headers: { origin, host }, protocol }) as unknown as FastifyRequest

        expect(() => assertSameOrigin(request('https://app.example.com'))).not.toThrow()
        expect(() => assertSameOrigin(request('http://localhost:5173', 'localhost:5173', 'http'))).not.toThrow()
        expect(() => assertSameOrigin(request('https://evil.example.com'))).toThrow()
        expect(() => assertSameOrigin(request('https://app.example.com/'))).toThrow()
        expect(() => assertSameOrigin(request(undefined))).toThrow()
        expect(() => assertSameOrigin(request('null'))).toThrow()
    })
})
