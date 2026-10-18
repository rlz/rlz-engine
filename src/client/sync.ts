import { DateTime } from 'luxon'

import { toValidDateTime } from '../shared/utils/datetime.js'

export interface SyncComparisonObject {
    id: string
    lastModified: string
}

export async function syncItems<T extends { id: string; lastModified: DateTime<true> }>({
    getRemoteLastModified,
    localItems,
    pushRemote,
    getRemote,
    pushLocal,
    lastSyncDate
}: {
    getRemoteLastModified: () => Promise<{ items: readonly SyncComparisonObject[] }>
    localItems: readonly T[]
    pushRemote: (items: readonly T[]) => Promise<void>
    getRemote: (ids: readonly string[]) => Promise<T[]>
    pushLocal: (items: readonly T[]) => void
    lastSyncDate: DateTime<true> | null
}): Promise<void> {
    const remoteItems = (await getRemoteLastModified()).items
    const remoteItemsMap = Object.fromEntries(
        remoteItems.map((i) => [i.id, toValidDateTime(DateTime.fromISO(i.lastModified, { zone: 'utc' }))])
    )

    const itemsToGet: string[] = []
    const itemsToPush: T[] = []

    for (const i of localItems) {
        const ri = remoteItemsMap[i.id]
        if (ri === undefined) {
            if (lastSyncDate === null || i.lastModified > lastSyncDate) {
                itemsToPush.push(i)
            }
            continue
        }

        if (ri.equals(i.lastModified)) {
            continue
        }

        if (ri < i.lastModified) {
            itemsToPush.push(i)
            continue
        }

        itemsToGet.push(i.id)
    }

    const knownItems = new Set(localItems.map((i) => i.id))
    for (const { id } of remoteItems) {
        if (!knownItems.has(id)) {
            itemsToGet.push(id)
        }
    }

    // Push local edits before applying fetched remote versions so the two directions
    // remain explicit and the caller can persist remote results after uploads finish.
    if (itemsToPush.length > 0) {
        await pushRemote(itemsToPush)
    }

    if (itemsToGet.length > 0) {
        pushLocal(await getRemote(itemsToGet))
    }
}
