import { httpErrors } from '@fastify/sensible'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { Binary, MongoServerError } from 'mongodb'
import { uuidv7 } from 'uuidv7'

import type { AuthStorage } from './storage.js'
import type { StorageUser } from './model.js'

const PASSWORD_HASH_VERSION = 1
const PASSWORD_HASH_BYTES = 64
const LEGACY_SCRYPT_OPTIONS = { N: 1024, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }
const CURRENT_SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const DUMMY_SALT = Buffer.alloc(64, 0x5a)

export interface AuthUser {
    id: string
    name: string
    email: string
}

export async function signup(storage: AuthStorage, name: string, email: string, password: string): Promise<AuthUser> {
    const salt = randomBytes(64)
    const hash = await derivePasswordHash(password, salt, CURRENT_SCRYPT_OPTIONS)
    const id = uuidv7()
    try {
        await storage.createUser(id, name, email, new Binary(salt), new Binary(hash), PASSWORD_HASH_VERSION)
    } catch (e) {
        if (e instanceof MongoServerError && e.code === 11000) {
            throw httpErrors.conflict()
        }
        throw e
    }

    return { id, name, email }
}

export async function signin(storage: AuthStorage, name: string, password: string): Promise<AuthUser | null> {
    const user = await storage.getUser(name)
    if (user === null) {
        await derivePasswordHash(password, DUMMY_SALT, CURRENT_SCRYPT_OPTIONS)
        return null
    }

    if (user.passwordHashVersion === undefined) {
        const legacyHash = await derivePasswordHash(password, user.passwordSalt.value(), LEGACY_SCRYPT_OPTIONS, 512)
        if (!hashMatches(legacyHash, user.passwordHash.value())) {
            await derivePasswordHash(password, DUMMY_SALT, CURRENT_SCRYPT_OPTIONS)
            return null
        }

        const salt = randomBytes(64)
        const upgradedHash = await derivePasswordHash(password, salt, CURRENT_SCRYPT_OPTIONS)
        await storage.updateLegacyPasswordHash(user._id, user.passwordSalt, user.passwordHash, new Binary(salt), new Binary(upgradedHash))
    } else if (user.passwordHashVersion === PASSWORD_HASH_VERSION) {
        const hash = await derivePasswordHash(password, user.passwordSalt.value(), CURRENT_SCRYPT_OPTIONS)
        if (!hashMatches(hash, user.passwordHash.value())) return null
    } else {
        return null
    }

    await storage.markUserActive(user._id)
    return toAuthUser(user)
}

export function toAuthUser(user: Pick<StorageUser, '_id' | 'name' | 'email'>): AuthUser {
    return { id: user._id, name: user.name, email: user.email }
}

async function derivePasswordHash(
    password: string,
    salt: Uint8Array,
    options: typeof LEGACY_SCRYPT_OPTIONS | typeof CURRENT_SCRYPT_OPTIONS,
    keyLength = PASSWORD_HASH_BYTES
): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
        scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
            if (error !== null) reject(error)
            else resolve(derivedKey)
        })
    })
}

function hashMatches(actual: Uint8Array, expected: Uint8Array): boolean {
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
