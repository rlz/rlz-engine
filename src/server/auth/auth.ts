import { httpErrors } from '@fastify/sensible'
import { randomBytes, scryptSync } from 'crypto'
import { FastifyInstance, FastifyRequest, RawServerBase } from 'fastify'
import fp from 'fastify-plugin'
import { DateTime } from 'luxon'
import { Binary, MongoServerError } from 'mongodb'
import { uuidv7 } from 'uuidv7'
import zodToJsonSchema from 'zod-to-json-schema'

import { API_AUTH_RESPONSE_SCHEMA_V0, API_SIGNIN_REQUEST_SCHEMA_V0, API_SIGNUP_REQUEST_SCHEMA_V0, ApiAuthResponseV0 } from '../auth/api'
import { AuthStorage } from './storage'

const TEMP_PASSWORD_SALT = Buffer.from('cashmony-temp-password-salt', 'utf8')

async function signup(storage: AuthStorage, name: string, email: string, password: string): Promise<ApiAuthResponseV0> {
    const salt = randomBytes(64)
    const hash = calcHash(password, salt)
    const id = uuidv7()
    try {
        await storage.createUser(id, name, email, new Binary(salt), new Binary(hash))
    } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) {
            // duplicate key error
            throw httpErrors.conflict()
        }
        throw e
    }
    const tempPassword = await makeTempPassword(storage, id)
    return {
        id,
        name,
        email,
        tempPassword
    }
}

async function signin(storage: AuthStorage, name: string, password: string): Promise<ApiAuthResponseV0 | null> {
    const u = await storage.getUser(name)
    if (u === null) {
        return null
    }

    const hash = calcHash(password, u.passwordSalt.value())

    if (!hash.equals(u.passwordHash.value())) {
        return null
    }

    const tempPassword = await makeTempPassword(storage, u._id)

    await storage.markUserActive(u._id)

    return {
        id: u._id,
        name: u.name,
        email: u.email,
        tempPassword
    }
}

async function logout(storage: AuthStorage, userId: string, tempPassword: string) {
    const hash = calcHash(tempPassword, TEMP_PASSWORD_SALT)
    await storage.deleteTempPassword(userId, new Binary(hash))
}

async function verifyTempPassword(storage: AuthStorage, userId: string, tempPassword: string): Promise<string> {
    const hash = calcTempPasswordHash(Buffer.from(tempPassword, 'base64'))
    const u = await storage.getUserByTempPassword(userId, new Binary(hash))
    if (u === null) {
        throw httpErrors.forbidden()
    }

    await storage.markUserActive(u._id)

    return u._id
}

async function makeTempPassword(storage: AuthStorage, userId: string): Promise<string> {
    const password = randomBytes(128)
    const passwordHash = calcTempPasswordHash(password)
    // Temp passwords also are removed from Mongo by TTL index, make sure expirity dates are syncronised
    await storage.pushTempPassword(userId, new Binary(passwordHash), DateTime.utc().plus({ days: 7 }).toJSDate())
    return password.toString('base64')
}

interface AuthEndpointsOpts {
    storage: AuthStorage
}

export const AUTH_ENDPOINTS = fp(
    async function authEndpoints<T extends RawServerBase>(app: FastifyInstance<T>, { storage }: AuthEndpointsOpts) {
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

export async function auth(req: Pick<FastifyRequest, 'headers'>, storage: AuthStorage): Promise<string> {
    const authHeader = req.headers.authorization
    if (authHeader === undefined) {
        throw httpErrors.forbidden()
    }
    const [userId, tempPassword] = authHeader.split(':')

    return await verifyTempPassword(storage, userId, tempPassword)
}

function calcHash(password: string, salt: Uint8Array): Buffer {
    return scryptSync(password, salt, 512, { N: 1024 })
}

function calcTempPasswordHash(tempPassword: Uint8Array): Buffer {
    return scryptSync(tempPassword, TEMP_PASSWORD_SALT, 512, { N: 1024 })
}
