import { DateTime } from 'luxon'
import { Binary, Collection } from 'mongodb'

import { getSystemLogger } from '../logger/system-logger.js'
import { MongoStorage } from '../storage/db.js'
import { StorageSession, StorageUser } from './model.js'

export class AuthStorage {
    private readonly logger = getSystemLogger('AuthStorage')
    private readonly mongo: MongoStorage

    private constructor(mongo: MongoStorage) {
        this.mongo = mongo
    }

    static async create(mongo: MongoStorage) {
        const s = new AuthStorage(mongo)
        await s.init()
        return s
    }

    private async init() {
        await Promise.all(['users', 'sessions'].map((i) => this.mongo.createCollection(i)))

        await this.createIndexes()
    }

    async createUser(id: string, name: string, email: string, passwordSalt: Binary, passwordHash: Binary, passwordHashVersion: number) {
        await this.users.insertOne({
            _id: id,
            name,
            email,
            passwordSalt,
            passwordHash,
            passwordHashVersion,
            lastActivityDate: DateTime.utc().toJSDate()
        })
    }

    async getUser(name: string): Promise<StorageUser | null> {
        return await this.users.findOne({ name })
    }

    async markUserActive(userId: string) {
        await this.users.updateOne({ _id: userId }, { $set: { lastActivityDate: DateTime.utc().toJSDate() } })
    }

    async getUserById(userId: string): Promise<StorageUser | null> {
        return await this.users.findOne({ _id: userId })
    }

    async updateLegacyPasswordHash(userId: string, oldSalt: Binary, oldHash: Binary, newSalt: Binary, newHash: Binary) {
        const result = await this.users.updateOne(
            { _id: userId, passwordSalt: oldSalt, passwordHash: oldHash, passwordHashVersion: { $exists: false } },
            { $set: { passwordSalt: newSalt, passwordHash: newHash, passwordHashVersion: 1 } }
        )
        return result.modifiedCount === 1
    }

    async createSession(sessionHash: Binary, userId: string, csrfToken: string, createdAt: Date, expiresAt: Date) {
        await this.sessions.insertOne({
            userId,
            sessionHash,
            csrfToken,
            createdAt,
            lastActivityAt: createdAt,
            expiresAt
        })
    }

    async getSession(sessionHash: Binary, now: Date, idleTimeoutMs: number): Promise<StorageSession | null> {
        const session = await this.sessions.findOne({ sessionHash, expiresAt: { $gt: now } })
        if (session === null) return null

        if (session.lastActivityAt.getTime() <= now.getTime() - idleTimeoutMs) {
            await this.sessions.deleteOne({ sessionHash })
            return null
        }

        return session
    }

    async touchSession(sessionHash: Binary, lastActivityAt: Date) {
        await this.sessions.updateOne({ sessionHash }, { $set: { lastActivityAt } })
    }

    async deleteSession(sessionHash: Binary) {
        await this.sessions.deleteOne({ sessionHash })
    }

    private async createIndexes() {
        await this.mongo.createIndexes(this.users, [
            {
                name: 'name_v0',
                key: {
                    name: 1
                },
                unique: true
            }
        ])
        await this.mongo.createIndexes(this.sessions, [
            {
                name: 'sessionHash_v1',
                key: { sessionHash: 1 },
                unique: true
            },
            {
                name: 'expiresAt_v1',
                key: {
                    expiresAt: 1
                },
                expireAfterSeconds: 0
            }
        ])
    }

    get users(): Collection<StorageUser> {
        return this.mongo.db.collection('users')
    }

    get sessions(): Collection<StorageSession> {
        return this.mongo.db.collection('sessions')
    }
}
