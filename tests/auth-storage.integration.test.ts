import { randomBytes, randomUUID } from 'node:crypto'
import { MongoClient, Binary } from 'mongodb'
import type { Collection, Db, Document } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSession, SESSION_ABSOLUTE_TIMEOUT_MS } from '../src/back/auth/session.js'
import { AuthStorage } from '../src/back/auth/storage.js'
import type { MongoStorage, StorageIndexDescription } from '../src/back/storage/db.js'

const mongoUri = process.env.MONGODB_TEST_URI
const integrationTest = mongoUri === undefined ? it.skip : it
const databaseName = `rlz_engine_auth_test_${randomUUID().replaceAll('-', '')}`
let client: MongoClient | undefined
let connected = false
let database: Db
let storage: AuthStorage

describe('AuthStorage MongoDB integration', () => {
    beforeAll(async () => {
        if (mongoUri === undefined) return

        client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 })
        await client.connect()
        connected = true
        database = client.db(databaseName)

        const mongo = {
            db: database,
            createCollection: async (name: string) => {
                await database.createCollection(name)
            },
            createIndexes: async (collection: Collection<Document>, indexes: StorageIndexDescription[]) => {
                await collection.createIndexes(indexes)
            }
        } as unknown as MongoStorage

        storage = await AuthStorage.create(mongo)
    }, 10_000)

    afterAll(async () => {
        try {
            if (client !== undefined && connected) await client.db(databaseName).dropDatabase()
        } finally {
            await client?.close()
        }
    })

    integrationTest('stores, refreshes, expires, and revokes sessions using MongoDB', async () => {
        const { sessionId } = await createSession(storage, 'user-1')
        const stored = await database.collection('sessions').findOne<{ sessionHash: Binary; createdAt: Date; expiresAt: Date }>()

        expect(stored).not.toBeNull()
        expect(stored!.sessionHash.value()).toHaveLength(32)
        expect(Buffer.from(stored!.sessionHash.value()).equals(Buffer.from(sessionId))).toBe(false)
        expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(SESSION_ABSOLUTE_TIMEOUT_MS)

        const indexes = await database.collection('sessions').listIndexes().toArray()
        expect(indexes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'sessionHash_v1', unique: true }),
                expect.objectContaining({ name: 'expiresAt_v1', expireAfterSeconds: 0 })
            ])
        )

        const sessionHash = stored!.sessionHash
        const lastActivityAt = new Date(Date.now() + 1000)
        await storage.touchSession(sessionHash, lastActivityAt)
        const refreshed = await database.collection('sessions').findOne({ sessionHash })
        expect(refreshed?.lastActivityAt).toEqual(lastActivityAt)

        await expect(storage.getSession(sessionHash, new Date(lastActivityAt.getTime() + 60_000), 60_000)).resolves.toBeNull()
        expect(await database.collection('sessions').countDocuments()).toBe(0)

        const absoluteExpiry = new Date(Date.now() - 1000)
        const expiredHash = new Binary(randomBytes(32))
        await storage.createSession(expiredHash, 'user-1', randomBytes(32).toString('base64url'), new Date(), absoluteExpiry)
        await expect(storage.getSession(expiredHash, new Date(), 60_000)).resolves.toBeNull()

        const revocableHash = new Binary(randomBytes(32))
        await storage.createSession(
            revocableHash,
            'user-1',
            randomBytes(32).toString('base64url'),
            new Date(),
            new Date(Date.now() + 60_000)
        )
        await storage.deleteSession(revocableHash)
        expect(await database.collection('sessions').findOne({ sessionHash: revocableHash })).toBeNull()
        expect(await database.collection('sessions').countDocuments()).toBe(1)
    })

    integrationTest('upgrades a legacy password hash with compare-and-set semantics', async () => {
        const oldSalt = new Binary(randomBytes(64))
        const oldHash = new Binary(randomBytes(512))
        const newSalt = new Binary(randomBytes(64))
        const newHash = new Binary(randomBytes(64))
        await storage.users.insertOne({
            _id: 'legacy-user',
            name: 'Legacy',
            email: 'legacy@example.com',
            passwordSalt: oldSalt,
            passwordHash: oldHash,
            lastActivityDate: new Date()
        })

        await expect(storage.updateLegacyPasswordHash('legacy-user', oldSalt, oldHash, newSalt, newHash)).resolves.toBe(true)
        await expect(
            storage.updateLegacyPasswordHash('legacy-user', oldSalt, oldHash, new Binary(randomBytes(64)), new Binary(randomBytes(64)))
        ).resolves.toBe(false)
        const migrated = await storage.getUserById('legacy-user')
        expect(migrated?.passwordHashVersion).toBe(1)
        expect(migrated?.passwordSalt.value()).toEqual(newSalt.value())
        expect(migrated?.passwordHash.value()).toEqual(newHash.value())
    })
})
