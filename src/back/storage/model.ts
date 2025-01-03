import { z } from 'zod'

export interface MongoObject<T> {
    _id: string
    ownerId: string
    syncDate: Date
    data: T
}

export const SYNC_OBJECT_SCHEMA = z.object({
    _id: z.string().uuid(),
    data: z.object({
        lastModified: z.string().datetime()
    })
})

export interface SyncObject<T> {
    _id: string
    ownerId: string
    syncDate: Date
    data: T
}
