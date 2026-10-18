import { Binary } from 'mongodb'

export interface StorageUser {
    _id: string
    name: string
    email: string
    passwordSalt: Binary
    passwordHash: Binary
    passwordHashVersion?: number
    lastActivityDate: Date
}

export interface StorageSession {
    userId: string
    sessionHash: Binary
    csrfToken: string
    createdAt: Date
    lastActivityAt: Date
    expiresAt: Date
}
