export const PRODUCTION = process.env.NODE_ENV === 'production'

export interface FrontConfig {
    callLocalhost: boolean
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
            callLocalhost: !PRODUCTION
        }
    }

    return frontConfig
}
