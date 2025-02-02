import { FastifyBaseLogger } from 'fastify'
import { Collection, Db, Document, IndexDescription, MongoClient } from 'mongodb'

import { logger } from '../logger'

type StorageIndexDescription = IndexDescription & {
    name: string
}

export class MongoStorage {
    private readonly logger: FastifyBaseLogger
    private readonly client: MongoClient
    private dbName: string

    constructor(db: string) {
        this.logger = logger('MongoStorage')

        this.dbName = db
        this.client = new MongoClient('mongodb://localhost')
    }

    get db(): Db {
        return this.client.db(this.dbName)
    }

    async createCollection(name: string) {
        await this.db.createCollection(name)
    }

    async createIndexes<T extends Document>(collection: Collection<T>, indexes: StorageIndexDescription[]) {
        this.logger.info({ indexes: indexes?.map(i => i.name) ?? null, collection: collection.collectionName }, 'Configured indexes')

        const knownIndexes = await this.listIndexes(collection)

        this.logger.info({ indexes: Array.from(knownIndexes), collection: collection.collectionName }, 'Known indexes')

        knownIndexes.delete('_id_')

        for (const index of indexes) {
            if (knownIndexes.has(index.name)) {
                knownIndexes.delete(index.name)
                continue
            }

            this.logger.info({ index, collection: collection.collectionName }, 'Create index')

            await collection.createIndexes([index])
        }

        for (const name of knownIndexes) {
            this.logger.info({ index: name, collection: collection.collectionName }, 'Drop index')

            await collection.dropIndex(name)
        }
    }

    private async listIndexes<T extends Document>(collection: Collection<T>): Promise<Set<string>> {
        const indexes: IndexDescription[] = await collection.listIndexes().toArray()
        return new Set(indexes.map((i) => {
            if (i.name === undefined) {
                throw Error('Index with undefined name detected!')
            }
            return i.name
        }))
    }
}
