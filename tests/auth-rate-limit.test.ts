import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthRateLimiter } from '../src/back/auth/rate-limit.js'

describe('AuthRateLimiter', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('limits signup attempts per peer and keeps other peers and operations independent', async () => {
        const limiter = new AuthRateLimiter()
        const action = vi.fn(async () => 'ok')

        for (let attempt = 0; attempt < 5; attempt += 1) await limiter.run('signup', '192.0.2.1', action)
        await expect(limiter.run('signup', '192.0.2.1', action)).rejects.toMatchObject({ statusCode: 429 })
        await expect(limiter.run('signup', '192.0.2.2', action)).resolves.toBe('ok')
        await expect(limiter.run('signin', '192.0.2.1', action)).resolves.toBe('ok')
    })

    it('allows ten signin attempts per peer in a window and rejects the next one', async () => {
        const limiter = new AuthRateLimiter()

        for (let attempt = 0; attempt < 10; attempt += 1) await limiter.run('signin', '192.0.2.1', async () => {})
        await expect(limiter.run('signin', '192.0.2.1', async () => {})).rejects.toMatchObject({ statusCode: 429 })
    })

    it('starts a fresh rate window after the operation-specific interval', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        const limiter = new AuthRateLimiter()

        for (let attempt = 0; attempt < 5; attempt += 1) await limiter.run('signup', '192.0.2.1', async () => {})
        await expect(limiter.run('signup', '192.0.2.1', async () => {})).rejects.toMatchObject({ statusCode: 429 })

        vi.advanceTimersByTime(60 * 60 * 1000)
        await expect(limiter.run('signup', '192.0.2.1', async () => 'allowed')).resolves.toBe('allowed')
    })

    it('caps concurrent operations and releases a slot after the action settles', async () => {
        const limiter = new AuthRateLimiter()
        const releases: Array<() => void> = []
        const pending = Array.from({ length: 4 }, (_, index) =>
            limiter.run('signin', `192.0.2.${index + 1}`, () => new Promise<void>((resolve) => releases.push(resolve)))
        )

        await expect(limiter.run('signin', '192.0.2.5', async () => {})).rejects.toMatchObject({ statusCode: 429 })
        releases.forEach((release) => release())
        await Promise.all(pending)
        await expect(limiter.run('signin', '192.0.2.5', async () => 'allowed')).resolves.toBe('allowed')
    })

    it('releases the concurrency slot when an action throws', async () => {
        const limiter = new AuthRateLimiter()

        await expect(limiter.run('signin', '192.0.2.1', async () => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
        await expect(limiter.run('signin', '192.0.2.1', async () => 'allowed')).resolves.toBe('allowed')
    })
})
