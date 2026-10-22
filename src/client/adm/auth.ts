import type { AdmAuthParam } from '../rpc.js'

export function createAdminAuthState() {
    let auth: AdmAuthParam | null = null
    let owner: object | null = null

    return {
        get: () => auth,
        set: (nextAuth: AdmAuthParam, nextOwner: object) => {
            auth = nextAuth
            owner = nextOwner
        },
        clear: (currentOwner: object) => {
            if (owner === currentOwner) {
                auth = null
                owner = null
            }
        }
    }
}

const adminAuthState = createAdminAuthState()

export function setAdminSecret(secret: string, owner: object): void {
    adminAuthState.set({ adminSecret: secret }, owner)
}

export function clearAdminSecret(owner: object): void {
    adminAuthState.clear(owner)
}

export function getAdminAuth(): AdmAuthParam {
    const auth = adminAuthState.get()
    if (auth === null) throw Error('Unauthorized')
    return auth
}
