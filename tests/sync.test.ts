import { DateTime } from 'luxon'
import { describe, expect, it, vi } from 'vitest'

import { syncItems } from '../src/client/sync.js'
import { toValidDateTime } from '../src/shared/utils/datetime.js'

const date = (value: string) => toValidDateTime(DateTime.fromISO(value, { zone: 'utc' }))

describe('syncItems', () => {
    it('pushes newer local items and fetches newer or unknown remote items', async () => {
        const pushRemote = vi.fn(async () => {})
        const getRemote = vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id, lastModified: date('2025-01-03T00:00:00Z') })))
        const pushLocal = vi.fn()

        await syncItems({
            getRemoteLastModified: async () => ({
                items: [
                    { id: 'local-newer', lastModified: '2025-01-02T00:00:00.000Z' },
                    { id: 'local-older', lastModified: '2025-01-04T00:00:00.000Z' },
                    { id: 'remote-only', lastModified: '2025-01-05T00:00:00.000Z' },
                    { id: 'same', lastModified: '2025-01-01T00:00:00.000Z' }
                ]
            }),
            localItems: [
                { id: 'local-newer', lastModified: date('2025-01-03T00:00:00Z') },
                { id: 'local-older', lastModified: date('2025-01-01T00:00:00Z') },
                { id: 'same', lastModified: date('2025-01-01T00:00:00Z') }
            ],
            pushRemote,
            getRemote,
            pushLocal,
            lastSyncDate: null
        })

        expect(pushRemote).toHaveBeenCalledWith([{ id: 'local-newer', lastModified: date('2025-01-03T00:00:00Z') }])
        expect(getRemote).toHaveBeenCalledWith(['local-older', 'remote-only'])
        expect(pushLocal).toHaveBeenCalledOnce()
    })

    it('does not push an unchanged item or a missing remote item at or before last sync', async () => {
        const pushRemote = vi.fn(async () => {})
        const getRemote = vi.fn(async () => [])

        await syncItems({
            getRemoteLastModified: async () => ({ items: [{ id: 'same', lastModified: '2025-01-01T00:00:00.000Z' }] }),
            localItems: [
                { id: 'same', lastModified: date('2025-01-01T00:00:00Z') },
                { id: 'old-missing', lastModified: date('2024-12-31T00:00:00Z') }
            ],
            pushRemote,
            getRemote,
            pushLocal: () => {},
            lastSyncDate: date('2025-01-01T00:00:00Z')
        })

        expect(pushRemote).not.toHaveBeenCalled()
        expect(getRemote).not.toHaveBeenCalled()
    })
})
