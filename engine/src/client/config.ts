export const PRODUCTION = process.env.NODE_ENV === 'production'

export interface FrontConfig {
    apiDomain: string
}

let frontConfig: FrontConfig | null = null

export function initFrontConfig(cfg: FrontConfig) {
    if (frontConfig !== null) {
        throw Error('frontConfig already initialized!')
    }

    frontConfig = cfg
}

export function getFrontConfig(): FrontConfig {
    if (frontConfig === null) {
        frontConfig = {
            apiDomain: PRODUCTION ? '/' : 'http://localhost:8080/'
        }
    }

    return frontConfig
}
