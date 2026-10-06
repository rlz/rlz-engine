import { Binary } from 'mongodb'

export interface StorageUser {
    _id: string
    name: string
    email: string
    passwordSalt: Binary
    passwordHash: Binary
    lastActivityDate: Date
}

export interface StorageTempPassword {
    userId: string
    passwordHash: Binary
    validUntil: Date
}
