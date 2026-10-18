import { randomBytes } from 'node:crypto'
import { Binary } from 'mongodb'
import type { Collection, Document } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { createSession, SESSION_ABSOLUTE_TIMEOUT_MS } from '../src/back/auth/session.js'
import { AuthStorage } from '../src/back/auth/storage.js'
import type { StorageSession, StorageUser } from '../src/back/auth/model.js'
import type { MongoStorage, StorageIndexDescription } from '../src/back/storage/db.js'

function makeMongoStorage() {
    const documents = new Map<string, Record<string, unknown>[]>()
    const collections = new Map<string, Collection<Record<string, unknown>>>()
    const createIndexes = vi.fn(async (_collection: Collection<Document>, _indexes: StorageIndexDescription[]) => undefined)

    for (const name of ['users', 'sessions']) {
        const rows: Record<string, unknown>[] = []
        documents.set(name, rows)
        const collection = {
            collectionName: name,
            insertOne: async (document: Record<string, unknown>) => {
                rows.push(document)
                return { insertedId: document._id }
            },
            findOne: async (filter: Record<string, any>) => {
                const row = rows.find((document) =>
                    Object.entries(filter).every(([key, expected]) => {
                        if (key === 'expiresAt' && expected?.$gt instanceof Date) {
                            const expiresAt = document.expiresAt as Date
                            return expiresAt > expected.$gt
                        }
                        if (expected instanceof Binary) {
                            const actual = document[key]
                            return actual instanceof Binary && Buffer.from(actual.value()).equals(Buffer.from(expected.value()))
                        }
                        return document[key] === expected
                    })
                )
                return row ?? null
            },
            updateOne: async (filter: Record<string, any>, update: { $set: Record<string, unknown> }) => {
                const row = rows.find((document) =>
                    Object.entries(filter).every(([key, expected]) => {
                        if (expected && typeof expected === 'object' && '$exists' in expected) {
                            return key in document === expected.$exists
                        }
                        if (expected instanceof Binary) {
                            const actual = document[key]
                            return actual instanceof Binary && Buffer.from(actual.value()).equals(Buffer.from(expected.value()))
                        }
                        return document[key] === expected
                    })
                )
                if (row === undefined) return { modifiedCount: 0 }
                Object.assign(row, update.$set)
                return { modifiedCount: 1 }
            },
            deleteOne: async (filter: Record<string, unknown>) => {
                const index = rows.findIndex((document) =>
                    Object.entries(filter).every(([key, expected]) => {
                        const actual = document[key]
                        return actual instanceof Binary && expected instanceof Binary
                            ? Buffer.from(actual.value()).equals(Buffer.from(expected.value()))
                            : actual === expected
                    })
                )
                if (index >= 0) rows.splice(index, 1)
                return { deletedCount: index < 0 ? 0 : 1 }
            }
        } as unknown as Collection<Record<string, unknown>>
        collections.set(name, collection)
    }

    const mongo = {
        createCollection: vi.fn(async () => undefined),
        createIndexes,
        db: { collection: (name: string) => collections.get(name)! }
    } as unknown as MongoStorage

    return { mongo, documents, collections, createIndexes }
}

describe('AuthStorage sessions', () => {
    it('stores only session hashes, enforces expiry, and configures cleanup indexes', async () => {
        const { mongo, documents, collections, createIndexes } = makeMongoStorage()
        const storage = await AuthStorage.create(mongo)
        const { sessionId } = await createSession(storage, 'user-1')
        const rows = documents.get('sessions')!
        const stored = rows[0] as unknown as StorageSession

        expect(stored.sessionHash).toBeInstanceOf(Binary)
        expect(stored.sessionHash.value()).toHaveLength(32)
        expect(Buffer.from(stored.sessionHash.value()).equals(Buffer.from(sessionId))).toBe(false)
        expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(SESSION_ABSOLUTE_TIMEOUT_MS)
        await expect(storage.getSession(stored.sessionHash, new Date(), 60 * 60 * 1000)).resolves.toMatchObject({ userId: 'user-1' })

        const touchedAt = new Date(Date.now() + 1000)
        await storage.touchSession(stored.sessionHash, touchedAt)
        expect(stored.lastActivityAt).toEqual(touchedAt)

        const idleBoundary = new Date(touchedAt.getTime() + 60 * 60 * 1000)
        await expect(storage.getSession(stored.sessionHash, idleBoundary, 60 * 60 * 1000)).resolves.toBeNull()
        expect(rows).toHaveLength(0)

        const [sessionCollection, sessionIndexes] = createIndexes.mock.calls.find(
            ([collection]) => collection === collections.get('sessions')
        )!
        expect(sessionIndexes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'sessionHash_v1', unique: true }),
                expect.objectContaining({ name: 'expiresAt_v1', expireAfterSeconds: 0, key: { expiresAt: 1 } })
            ])
        )
        expect(sessionCollection).toBe(collections.get('sessions'))
    })

    it('rejects absolute expiry even when the session was recently active', async () => {
        const { mongo, documents } = makeMongoStorage()
        const storage = await AuthStorage.create(mongo)
        await createSession(storage, 'user-1')
        const stored = documents.get('sessions')![0] as unknown as StorageSession
        stored.expiresAt = new Date(Date.now() - 1)

        await expect(storage.getSession(stored.sessionHash, new Date(), 60 * 60 * 1000)).resolves.toBeNull()
    })

    it('upgrades a legacy password only when the stored hash still matches', async () => {
        const { mongo, documents } = makeMongoStorage()
        const storage = await AuthStorage.create(mongo)
        const oldSalt = new Binary(randomBytes(64))
        const oldHash = new Binary(randomBytes(512))
        const newSalt = new Binary(randomBytes(64))
        const newHash = new Binary(randomBytes(64))
        const user: StorageUser = {
            _id: 'user-1',
            name: 'Alex',
            email: 'alex@example.com',
            passwordSalt: oldSalt,
            passwordHash: oldHash,
            lastActivityDate: new Date()
        }
        documents.get('users')!.push(user as unknown as Record<string, unknown>)

        await expect(storage.updateLegacyPasswordHash(user._id, oldSalt, oldHash, newSalt, newHash)).resolves.toBe(true)
        expect(user.passwordHashVersion).toBe(1)
        expect(user.passwordHash).toBe(newHash)
        await expect(
            storage.updateLegacyPasswordHash(user._id, oldSalt, oldHash, new Binary(randomBytes(64)), new Binary(randomBytes(64)))
        ).resolves.toBe(false)
    })
})
