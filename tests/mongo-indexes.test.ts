import type { Collection, Document } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { MongoStorage, StorageIndexDescription } from '../src/back/storage/db.js'

function collectionWith(indexNames: string[]) {
    const dropIndex = vi.fn(async () => '')
    const createIndexes = vi.fn(async () => [])
    const collection = {
        collectionName: 'items',
        listIndexes: () => ({ toArray: async () => indexNames.map((name) => ({ name })) }),
        dropIndex,
        createIndexes
    } as unknown as Collection<Document>

    return { collection, dropIndex, createIndexes }
}

describe('MongoStorage.createIndexes', () => {
    it('keeps _id and configured indexes, drops stale indexes, and creates missing indexes', async () => {
        const { collection, dropIndex, createIndexes } = collectionWith(['_id_', 'by-owner', 'obsolete'])
        const storage = new MongoStorage('test')
        const configured: StorageIndexDescription[] = [
            { name: 'by-owner', key: { ownerId: 1 } },
            { name: 'by-date', key: { lastModified: -1 } }
        ]

        await storage.createIndexes(collection, configured)

        expect(dropIndex).toHaveBeenCalledExactlyOnceWith('obsolete')
        expect(createIndexes).toHaveBeenCalledExactlyOnceWith([configured[1]])
    })

    it('does not mutate a collection already matching the configured index names', async () => {
        const { collection, dropIndex, createIndexes } = collectionWith(['_id_', 'by-owner'])
        const storage = new MongoStorage('test')

        await storage.createIndexes(collection, [{ name: 'by-owner', key: { ownerId: 1 } }])

        expect(dropIndex).not.toHaveBeenCalled()
        expect(createIndexes).not.toHaveBeenCalled()
    })
})
