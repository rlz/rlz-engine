import { Binary, MongoServerError } from 'mongodb'
import { DateTime } from 'luxon'
import { describe, expect, it, vi } from 'vitest'

import { logout, signin, signup, verifyTempPassword } from '../src/back/auth/utils.js'
import type { AuthStorage } from '../src/back/auth/storage.js'

interface FakeUser {
    _id: string
    name: string
    email: string
    passwordSalt: Binary
    passwordHash: Binary
}

function makeAuthStorage() {
    const users: FakeUser[] = []
    const tempPasswords: { userId: string; passwordHash: Binary; validUntil: Date }[] = []
    const storage = {
        createUser: vi.fn(async (id: string, name: string, email: string, passwordSalt: Binary, passwordHash: Binary) => {
            users.push({ _id: id, name, email, passwordSalt, passwordHash })
        }),
        getUser: vi.fn(async (name: string) => users.find((user) => user.name === name) ?? null),
        markUserActive: vi.fn(),
        pushTempPassword: vi.fn(async (userId: string, passwordHash: Binary, validUntil: Date) => {
            tempPasswords.push({ userId, passwordHash, validUntil })
        }),
        getUserByTempPassword: vi.fn(async (userId: string, passwordHash: Binary) => {
            const stored = tempPasswords.find(
                (item) => item.userId === userId && Buffer.from(item.passwordHash.value()).equals(Buffer.from(passwordHash.value()))
            )
            if (stored === undefined || stored.validUntil < new Date()) return null
            return users.find((user) => user._id === userId) ?? null
        }),
        deleteTempPassword: vi.fn(async (userId: string, passwordHash: Binary) => {
            const index = tempPasswords.findIndex(
                (item) => item.userId === userId && Buffer.from(item.passwordHash.value()).equals(Buffer.from(passwordHash.value()))
            )
            if (index !== -1) tempPasswords.splice(index, 1)
        })
    }
    return { storage: storage as unknown as AuthStorage, users, tempPasswords }
}

describe('authentication utilities', () => {
    it('stores password hashes and issues a temporary credential valid for seven days', async () => {
        const { storage, users, tempPasswords } = makeAuthStorage()
        const response = await signup(storage, 'Alex', 'alex@example.com', 'password')

        expect(response).toMatchObject({ id: expect.any(String), name: 'Alex', email: 'alex@example.com' })
        expect(response.tempPassword).not.toBe('password')
        expect(users).toHaveLength(1)
        expect(users[0]?.passwordHash.value()).not.toEqual(Buffer.from('password'))
        expect(tempPasswords).toHaveLength(1)
        expect(tempPasswords[0]?.userId).toBe(response.id)
        expect(DateTime.fromJSDate(tempPasswords[0]!.validUntil).diffNow('days').days).toBeGreaterThan(6.99)
    })

    it('rejects duplicate account creation as a conflict', async () => {
        const { storage } = makeAuthStorage()
        vi.mocked(storage.createUser).mockRejectedValueOnce(new MongoServerError({ message: 'duplicate key', code: 11000 }))

        await expect(signup(storage, 'Alex', 'alex@example.com', 'password')).rejects.toMatchObject({ statusCode: 409 })
    })

    it('rejects missing users and incorrect passwords without issuing credentials', async () => {
        const { storage, tempPasswords } = makeAuthStorage()
        await expect(signin(storage, 'missing', 'password')).resolves.toBeNull()

        await signup(storage, 'Alex', 'alex@example.com', 'correct-password')
        const initialCredentialCount = tempPasswords.length
        await expect(signin(storage, 'Alex', 'wrong-password')).resolves.toBeNull()
        expect(tempPasswords).toHaveLength(initialCredentialCount)
        expect(storage.markUserActive).not.toHaveBeenCalled()
    })

    it('issues a new credential after successful signin and validates then revokes it', async () => {
        const { storage, tempPasswords } = makeAuthStorage()
        await signup(storage, 'Alex', 'alex@example.com', 'correct-password')

        const response = await signin(storage, 'Alex', 'correct-password')
        expect(response).not.toBeNull()
        expect(response?.tempPassword).toEqual(expect.any(String))
        expect(storage.markUserActive).toHaveBeenCalledWith(response?.id)

        await expect(verifyTempPassword(storage, response!.id, response!.tempPassword)).resolves.toBe(response!.id)
        expect(storage.markUserActive).toHaveBeenCalledTimes(2)

        const issuedHash = tempPasswords.at(-1)!.passwordHash.value()
        await logout(storage, response!.id, response!.tempPassword)
        await expect(verifyTempPassword(storage, response!.id, response!.tempPassword)).rejects.toMatchObject({ statusCode: 403 })
        expect(tempPasswords.some((item) => Buffer.from(item.passwordHash.value()).equals(Buffer.from(issuedHash)))).toBe(false)
    })

    it('rejects invalid and expired temporary credentials', async () => {
        const { storage, tempPasswords } = makeAuthStorage()
        const response = await signup(storage, 'Alex', 'alex@example.com', 'password')
        await expect(verifyTempPassword(storage, response.id, 'invalid')).rejects.toMatchObject({ statusCode: 403 })

        tempPasswords[0]!.validUntil = new Date(Date.now() - 1)
        await expect(verifyTempPassword(storage, response.id, response.tempPassword)).rejects.toMatchObject({ statusCode: 403 })
    })
})
