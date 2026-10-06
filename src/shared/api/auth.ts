import { z } from 'zod'

export const API_AUTH_RESPONSE_SCHEMA_V0 = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    tempPassword: z.string()
})

export type ApiAuthResponseV0 = z.infer<typeof API_AUTH_RESPONSE_SCHEMA_V0>

export const API_SIGNUP_REQUEST_SCHEMA_V0 = z.object({
    name: z.string(),
    email: z.string().email(),
    password: z.string()
})

export type ApiSignupRequestV0 = z.infer<typeof API_SIGNUP_REQUEST_SCHEMA_V0>

export const API_SIGNIN_REQUEST_SCHEMA_V0 = z.object({
    name: z.string(),
    password: z.string()
})

export type ApiSigninRequestV0 = z.infer<typeof API_SIGNIN_REQUEST_SCHEMA_V0>
