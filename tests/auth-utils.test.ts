import { scryptSync, randomBytes } from 'node:crypto'
import { Binary, MongoServerError } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import type { AuthStorage } from '../src/back/auth/storage.js'
import { signin, signup } from '../src/back/auth/utils.js'

interface FakeUser {
    _id: string
    name: string
    email: string
    passwordSalt: Binary
    passwordHash: Binary
    passwordHashVersion?: number
}

function makeAuthStorage() {
    const users: FakeUser[] = []
    const storage = {
        createUser: vi.fn(
            async (id: string, name: string, email: string, passwordSalt: Binary, passwordHash: Binary, passwordHashVersion: number) => {
                users.push({ _id: id, name, email, passwordSalt, passwordHash, passwordHashVersion })
            }
        ),
        getUser: vi.fn(async (name: string) => users.find((user) => user.name === name) ?? null),
        markUserActive: vi.fn(),
        updateLegacyPasswordHash: vi.fn(async (id: string, oldSalt: Binary, oldHash: Binary, newSalt: Binary, newHash: Binary) => {
            const user = users.find((item) => item._id === id && item.passwordHashVersion === undefined)
            if (
                user === undefined ||
                !Buffer.from(user.passwordSalt.value()).equals(Buffer.from(oldSalt.value())) ||
                !Buffer.from(user.passwordHash.value()).equals(Buffer.from(oldHash.value()))
            ) {
                return false
            }
            user.passwordSalt = newSalt
            user.passwordHash = newHash
            user.passwordHashVersion = 1
            return true
        })
    }
    return { storage: storage as unknown as AuthStorage, users }
}

describe('authentication utilities', () => {
    it('stores new passwords with the current hash version and returns no credential', async () => {
        const { storage, users } = makeAuthStorage()
        const response = await signup(storage, 'Alex', 'alex@example.com', 'password')

        expect(response).toMatchObject({ id: expect.any(String), name: 'Alex', email: 'alex@example.com' })
        expect(response).not.toHaveProperty('tempPassword')
        expect(users).toHaveLength(1)
        expect(users[0]?.passwordHashVersion).toBe(1)
        expect(users[0]?.passwordHash.value()).not.toEqual(Buffer.from('password'))
        expect(users[0]?.passwordHash.value()).toEqual(
            scryptSync('password', users[0]!.passwordSalt.value(), 64, { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })
        )
    })

    it('rejects duplicate account creation as a conflict', async () => {
        const { storage } = makeAuthStorage()
        vi.mocked(storage.createUser).mockRejectedValueOnce(new MongoServerError({ message: 'duplicate key', code: 11000 }))

        await expect(signup(storage, 'Alex', 'alex@example.com', 'password')).rejects.toMatchObject({ statusCode: 409 })
    })

    it('verifies legacy password hashes and upgrades them after successful signin', async () => {
        const { storage, users } = makeAuthStorage()
        const salt = randomBytes(64)
        const legacyHash = scryptSync('existing-password', salt, 512, { N: 1024 })
        users.push({
            _id: 'legacy-user',
            name: 'Legacy',
            email: 'legacy@example.com',
            passwordSalt: new Binary(salt),
            passwordHash: new Binary(legacyHash)
        })

        const user = await signin(storage, 'Legacy', 'existing-password')
        expect(user).toEqual({ id: 'legacy-user', name: 'Legacy', email: 'legacy@example.com' })
        expect(users[0]?.passwordHashVersion).toBe(1)
        expect(users[0]?.passwordHash.value()).not.toEqual(legacyHash)
        expect(storage.updateLegacyPasswordHash).toHaveBeenCalledOnce()
        await expect(signin(storage, 'Legacy', 'existing-password')).resolves.toEqual(user)
    })

    it('does not upgrade a legacy hash or mark the user active for a wrong password', async () => {
        const { storage, users } = makeAuthStorage()
        const salt = randomBytes(64)
        const legacyHash = scryptSync('existing-password', salt, 512, { N: 1024 })
        users.push({
            _id: 'legacy-user',
            name: 'Legacy',
            email: 'legacy@example.com',
            passwordSalt: new Binary(salt),
            passwordHash: new Binary(legacyHash)
        })

        await expect(signin(storage, 'Legacy', 'wrong-password')).resolves.toBeNull()
        expect(users[0]?.passwordHashVersion).toBeUndefined()
        expect(users[0]?.passwordHash.value()).toEqual(legacyHash)
        expect(storage.updateLegacyPasswordHash).not.toHaveBeenCalled()
        expect(storage.markUserActive).not.toHaveBeenCalled()
    })

    it('rejects password hash versions that the engine does not support', async () => {
        const { storage, users } = makeAuthStorage()
        const salt = randomBytes(64)
        users.push({
            _id: 'future-user',
            name: 'Future',
            email: 'future@example.com',
            passwordSalt: new Binary(salt),
            passwordHash: new Binary(randomBytes(64)),
            passwordHashVersion: 999
        })

        await expect(signin(storage, 'Future', 'password')).resolves.toBeNull()
        expect(storage.markUserActive).not.toHaveBeenCalled()
    })

    it('rejects missing users and incorrect passwords', async () => {
        const { storage } = makeAuthStorage()
        await expect(signin(storage, 'missing', 'password')).resolves.toBeNull()

        await signup(storage, 'Alex', 'alex@example.com', 'correct-password')
        await expect(signin(storage, 'Alex', 'wrong-password')).resolves.toBeNull()
        expect(storage.markUserActive).not.toHaveBeenCalled()
    })
})
