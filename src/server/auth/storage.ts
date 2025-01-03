import { DateTime } from 'luxon'
import { Binary, Collection } from 'mongodb'

import { logger } from '../logger'
import { MongoStorage } from '../mongo/db'
import { StorageTempPassword, StorageUser } from './model'

export class AuthStorage {
    private readonly logger = logger('AuthStorage')
    private readonly mongo: MongoStorage

    constructor(mongo: MongoStorage) {
        this.mongo = mongo
    }

    async init() {
        await Promise.all([
            'users', 'temp-passwords'
        ].map(i => this.mongo.createCollection(i)))

        await this.createIndexes()
    }

    async createUser(id: string, name: string, email: string, passwordSalt: Binary, passwordHash: Binary) {
        await this.users.insertOne({
            _id: id,
            name,
            email,
            passwordSalt,
            passwordHash,
            lastActivityDate: DateTime.utc().toJSDate()
        })
    }

    async getUser(name: string): Promise<StorageUser | null> {
        return await this.users.findOne({ name })
    }

    async markUserActive(userId: string) {
        await this.users.updateOne({ _id: userId }, { $set: { lastActivityDate: DateTime.utc().toJSDate() } })
    }

    async pushTempPassword(userId: string, passwordHash: Binary, validUntil: Date) {
        await this.tempPasswords.insertOne({
            userId,
            passwordHash,
            validUntil
        })
    }

    async deleteTempPassword(userId: string, passwordHash: Binary) {
        await this.tempPasswords.deleteOne({ userId, passwordHash })
    }

    async getUserByTempPassword(userId: string, passwordHash: Binary): Promise<StorageUser | null> {
        const t = await this.tempPasswords.findOne({ userId, passwordHash })

        if (t === null) {
            return null
        }

        if (DateTime.utc() > DateTime.fromJSDate(t.validUntil)) {
            await this.tempPasswords.deleteOne({ _id: t._id })
            return null
        }

        return await this.users.findOne({ _id: t.userId })
    }

    private async createCollections() {
    }

    private async createIndexes() {
        await this.mongo.createIndexes(this.users,
            [
                {
                    name: 'name_v0',
                    key: {
                        name: 1
                    },
                    unique: true
                }
            ]
        )
        await this.mongo.createIndexes(this.tempPasswords,
            [
                {
                    name: 'userId_v0',
                    key: {
                        userId: 1
                    }
                },
                {
                    name: 'ttl_v0',
                    key: {
                        passwordHash: 1
                    },
                    // Temp passwords also have expirity dates, make sure they are syncronized with this expirity index
                    expireAfterSeconds: 60 * 60 * 24 * 7 // 7 days
                }
            ]
        )
    }

    get users(): Collection<StorageUser> {
        return this.mongo.db.collection('users')
    }

    get tempPasswords(): Collection<StorageTempPassword> {
        return this.mongo.db.collection('temp-passwords')
    }
}
