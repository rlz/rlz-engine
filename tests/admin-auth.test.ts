import { describe, expect, it } from 'vitest'

import { createAdminAuthState } from '../src/client/adm/auth.js'

describe('Admin auth state', () => {
    it('does not let a previous module clear the next module auth', () => {
        const state = createAdminAuthState()
        const engines = {}
        const strategies = {}
        const auth = { adminSecret: 'secret' }

        state.set(auth, engines)
        state.set(auth, strategies)
        state.clear(engines)

        expect(state.get()).toEqual(auth)
    })

    it('clears auth when its active owner unmounts', () => {
        const state = createAdminAuthState()
        const logs = {}

        state.set({ adminSecret: 'secret' }, logs)
        state.clear(logs)

        expect(state.get()).toBeNull()
    })
})
