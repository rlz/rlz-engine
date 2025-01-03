import { httpErrors } from '@fastify/sensible'
import { FastifyInstance, RawServerBase } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import zodToJsonSchema from 'zod-to-json-schema'

import { API_AUTH_RESPONSE_SCHEMA_V0, API_SIGNIN_REQUEST_SCHEMA_V0, API_SIGNUP_REQUEST_SCHEMA_V0 } from '../../shared/api/auth'
import { AuthStorage } from './storage'
import { logout, signin, signup } from './utils'

interface AuthEndpointsOpts {
    storage: AuthStorage
}

export const AUTH_API = fastifyPlugin(
    async function authApi<T extends RawServerBase>(app: FastifyInstance<T>, { storage }: AuthEndpointsOpts) {
        app.post(
            '/api/v0/signup',
            {
                schema: {
                    body: zodToJsonSchema(API_SIGNUP_REQUEST_SCHEMA_V0),
                    response: { 200: zodToJsonSchema(API_AUTH_RESPONSE_SCHEMA_V0) }
                }
            },
            async (req, _resp) => {
                const body = API_SIGNUP_REQUEST_SCHEMA_V0.parse(req.body)
                return await signup(storage, body.name, body.email, body.password)
            }
        )

        app.post(
            '/api/v0/signin',
            {
                schema: {
                    body: zodToJsonSchema(API_SIGNIN_REQUEST_SCHEMA_V0),
                    response: { 200: zodToJsonSchema(API_AUTH_RESPONSE_SCHEMA_V0) }
                }
            },
            async (req, _resp) => {
                const body = API_SIGNIN_REQUEST_SCHEMA_V0.parse(req.body)
                const r = await signin(storage, body.name, body.password)
                if (r === null) {
                    return httpErrors.unauthorized()
                }
                return r
            }
        )

        app.post(
            '/api/v0/logout',
            {
            },
            async (req, _resp) => {
                const authHeader = req.headers.authorization

                if (authHeader === undefined) {
                    throw httpErrors.forbidden()
                }

                const [userId, tempPassword] = authHeader.split(':')

                await logout(storage, userId, tempPassword)
            }
        )
    }
)
