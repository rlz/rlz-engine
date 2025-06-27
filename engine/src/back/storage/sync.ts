import { DateTime } from 'luxon'
import { Collection } from 'mongodb'

import { ApiComparisonObjectV0 } from '../../shared/api/sync'
import { SYNC_OBJECT_SCHEMA, SyncObject } from './model'

export async function getAll<T>(c: Collection<SyncObject<T>>, ownerId: string, syncAfter?: DateTime<true>): Promise<ApiComparisonObjectV0[]> {
    const items: ApiComparisonObjectV0[] = []
    const query = syncAfter === undefined
        ? { ownerId }
        : { ownerId, syncDate: { $gt: syncAfter.toJSDate() } }
    const cursor = c.find(query).project({ 'data.lastModified': 1 })
    for await (const op of cursor) {
        const parsed = SYNC_OBJECT_SCHEMA.parse(op)
        items.push({
            id: parsed._id,
            lastModified: parsed.data.lastModified
        })
    }
    return items
}
