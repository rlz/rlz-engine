import { z } from 'zod'

import { API_AUTH_RESPONSE_SCHEMA_V0, ApiAuthResponseV0, ApiSigninRequestV0, ApiSignupRequestV0 } from '../../shared/api/auth'
import { apiCall, AuthParam } from './api'

export async function apiSignup(name: string, email: string, password: string): Promise<ApiAuthResponseV0> {
    const req: ApiSignupRequestV0 = {
        name,
        email,
        password
    }

    return apiCall('v0', 'post', 'signup', null, null, req, API_AUTH_RESPONSE_SCHEMA_V0)
}

export async function apiSignin(name: string, password: string): Promise<ApiAuthResponseV0> {
    const req: ApiSigninRequestV0 = {
        name,
        password
    }

    return apiCall('v0', 'post', 'signin', null, null, req, API_AUTH_RESPONSE_SCHEMA_V0)
}

export async function apiLogout(auth: AuthParam): Promise<void> {
    await apiCall('v0', 'post', 'logout', auth, null, null, z.undefined())
}
