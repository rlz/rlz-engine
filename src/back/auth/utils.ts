import { httpErrors } from '@fastify/sensible'
import { randomBytes, scryptSync } from 'crypto'
import { FastifyRequest } from 'fastify'
import { DateTime } from 'luxon'
import { Binary, MongoServerError } from 'mongodb'
import { uuidv7 } from 'uuidv7'

import { ApiAuthResponseV0 } from '../../shared/api/auth.js'
import { AuthStorage } from './storage.js'

const TEMP_PASSWORD_SALT = Buffer.from('cashmony-temp-password-salt', 'utf8')

export async function signup(storage: AuthStorage, name: string, email: string, password: string): Promise<ApiAuthResponseV0> {
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

export async function signin(storage: AuthStorage, name: string, password: string): Promise<ApiAuthResponseV0 | null> {
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

export async function logout(storage: AuthStorage, userId: string, tempPassword: string) {
    const hash = calcHash(tempPassword, TEMP_PASSWORD_SALT)
    await storage.deleteTempPassword(userId, new Binary(hash))
}

export async function verifyTempPassword(storage: AuthStorage, userId: string, tempPassword: string): Promise<string> {
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

export async function auth(headers: FastifyRequest['headers'], storage: AuthStorage): Promise<string> {
    const authHeader = headers.authorization
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
