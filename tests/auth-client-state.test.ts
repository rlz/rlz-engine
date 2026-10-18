import { afterEach, describe, expect, it, vi } from 'vitest'

describe('client authentication state', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('drops persisted temporary passwords and never persists the CSRF token', async () => {
        const values = new Map<string, string>()
        values.set(
            'AUTH',
            JSON.stringify({
                state: {
                    id: 'legacy-user',
                    name: 'Alex',
                    email: 'alex@example.com',
                    tempPassword: 'old-browser-credential'
                },
                version: 0
            })
        )
        const localStorage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key)
        }
        vi.stubGlobal('localStorage', localStorage)
        vi.stubGlobal('window', { localStorage })
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
        vi.stubGlobal('fetch', fetchMock)
        vi.resetModules()

        const [{ useAuthState }, { getCsrfToken }, { rpcCall }] = await Promise.all([
            import('../src/client/state/auth.js'),
            import('../src/client/config.js'),
            import('../src/client/rpc.js')
        ])

        expect(useAuthState.getState()).toMatchObject({ id: 'legacy-user', name: 'Alex', email: 'alex@example.com', csrfToken: null })
        expect(useAuthState.getState()).not.toHaveProperty('tempPassword')

        useAuthState.getState().login('new-user', 'Alex', 'alex@example.com', 'session-csrf-token')
        expect(getCsrfToken()).toBe('session-csrf-token')
        await rpcCall('auth', 'logout', 1, {})
        expect(fetchMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                credentials: 'same-origin',
                headers: expect.objectContaining({ 'x-csrf-token': 'session-csrf-token' })
            })
        )

        const persisted = JSON.parse(values.get('AUTH')!) as { state: Record<string, unknown> }
        expect(persisted.state).toEqual({ id: 'new-user', name: 'Alex', email: 'alex@example.com' })
        expect(JSON.stringify(persisted)).not.toContain('session-csrf-token')

        useAuthState.getState().logout()
        expect(getCsrfToken()).toBeNull()
    })
})
