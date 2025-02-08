import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { AuthParam } from '../api/api'

const AUTH_ID_KEY = 'AUTH_ID'
const AUTH_NAME_KEY = 'AUTH_NAME'
const AUTH_EMAIL_KEY = 'AUTH_EMAIL'
const AUTH_TEMP_PASSWORD_KEY = 'AUTH_TEMP_PASSWORD'

localStorage.removeItem(AUTH_ID_KEY)
localStorage.removeItem(AUTH_NAME_KEY)
localStorage.removeItem(AUTH_EMAIL_KEY)
localStorage.removeItem(AUTH_TEMP_PASSWORD_KEY)

export interface AuthState {
    id: string | null
    name: string | null
    email: string | null
    tempPassword: string | null
    getAuthParam: () => AuthParam | null
    login: (id: string, name: string, email: string, tempPassword: string) => void
    logout: () => void
}

let cachedAuthParam: AuthParam | null = null

// eslint-disable-next-line @typescript-eslint/naming-convention
export const useAuthState = create<AuthState>()(
    persist(
        (set, get) => ({
            id: null,
            name: null,
            email: null,
            tempPassword: null,

            getAuthParam: () => {
                const { id, tempPassword } = get()

                if (id === null || tempPassword === null) {
                    return null
                }

                if (
                    id === cachedAuthParam?.userId
                    && tempPassword === cachedAuthParam?.tempPassword
                ) {
                    return cachedAuthParam
                }

                cachedAuthParam = {
                    userId: id,
                    tempPassword
                }

                return cachedAuthParam
            },
            login: (id: string, name: string, email: string, tempPassword: string) => set({ id, name, email, tempPassword }),
            logout: () => set({ id: null, name: null, email: null, tempPassword: null })
        }),
        { name: 'AUTH' }
    )
)
