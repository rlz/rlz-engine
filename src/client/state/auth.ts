import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { setCsrfToken } from '../config.js'

const AUTH_ID_KEY = 'AUTH_ID'
const AUTH_NAME_KEY = 'AUTH_NAME'
const AUTH_EMAIL_KEY = 'AUTH_EMAIL'

localStorage.removeItem(AUTH_ID_KEY)
localStorage.removeItem(AUTH_NAME_KEY)
localStorage.removeItem(AUTH_EMAIL_KEY)

export interface AuthState {
    id: string | null
    name: string | null
    email: string | null
    csrfToken: string | null
    login: (id: string, name: string, email: string, csrfToken: string) => void
    logout: () => void
}

export const useAuthState = create<AuthState>()(
    persist(
        (set) => ({
            id: null,
            name: null,
            email: null,
            csrfToken: null,
            login: (id, name, email, csrfToken) => {
                setCsrfToken(csrfToken)
                set({ id, name, email, csrfToken })
            },
            logout: () => {
                setCsrfToken(null)
                set({ id: null, name: null, email: null, csrfToken: null })
            }
        }),
        {
            name: 'AUTH',
            version: 2,
            partialize: ({ id, name, email }) => ({ id, name, email }),
            migrate: (persistedState) => {
                const oldState = persistedState as Partial<AuthState>
                return {
                    id: typeof oldState.id === 'string' ? oldState.id : null,
                    name: typeof oldState.name === 'string' ? oldState.name : null,
                    email: typeof oldState.email === 'string' ? oldState.email : null,
                    csrfToken: null
                }
            }
        }
    )
)
