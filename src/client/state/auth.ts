import { autorun, makeAutoObservable } from 'mobx'

const AUTH_ID_KEY = 'AUTH_TOKEN'
const AUTH_NAME_KEY = 'AUTH_TOKEN'
const AUTH_EMAIL_KEY = 'AUTH_TOKEN'
const AUTH_TEMP_PASSWORD_KEY = 'AUTH_TOKEN'

export class AuthState {
    id: string | null = localStorage.getItem(AUTH_ID_KEY)
    name: string | null = localStorage.getItem(AUTH_NAME_KEY)
    email: string | null = localStorage.getItem(AUTH_EMAIL_KEY)
    tempPassword: string | null = localStorage.getItem(AUTH_TEMP_PASSWORD_KEY)

    constructor() {
        makeAutoObservable(this)

        autorun(() => {
            if (this.id !== null) {
                localStorage.setItem(AUTH_ID_KEY, this.id)
            } else {
                localStorage.removeItem(AUTH_ID_KEY)
            }
        })

        autorun(() => {
            if (this.name !== null) {
                localStorage.setItem(AUTH_NAME_KEY, this.name)
            } else {
                localStorage.removeItem(AUTH_NAME_KEY)
            }
        })

        autorun(() => {
            if (this.email !== null) {
                localStorage.setItem(AUTH_EMAIL_KEY, this.email)
            } else {
                localStorage.removeItem(AUTH_EMAIL_KEY)
            }
        })

        autorun(() => {
            if (this.tempPassword !== null) {
                localStorage.setItem(AUTH_TEMP_PASSWORD_KEY, this.tempPassword)
            } else {
                localStorage.removeItem(AUTH_TEMP_PASSWORD_KEY)
            }
        })
    }

    logout() {
        this.id = null
        this.name = null
        this.email = null
        this.tempPassword = null
    }

    login(id: string, name: string, email: string, tempPassword: string) {
        this.id = id
        this.name = name
        this.email = email
        this.tempPassword = tempPassword
    }
}

let state: AuthState | null = null

export function useAuthState(): AuthState {
    if (state === null) {
        state = new AuthState()
    }

    return state
}
