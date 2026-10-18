import { httpErrors } from '@fastify/sensible'

const SIGNIN_WINDOW_MS = 15 * 60 * 1000
const SIGNIN_ATTEMPTS_PER_WINDOW = 10
const SIGNUP_WINDOW_MS = 60 * 60 * 1000
const SIGNUP_ATTEMPTS_PER_WINDOW = 5
const MAX_CONCURRENT_OPERATIONS = 4
const MAX_TRACKED_BUCKETS = 10_000

type AuthOperation = 'signin' | 'signup'

interface RateBucket {
    startedAt: number
    attempts: number
    expiresAt: number
}

/** Bounds anonymous password-hash work per peer and across this server process. */
export class AuthRateLimiter {
    private readonly buckets = new Map<string, RateBucket>()
    private activeOperations = 0
    private bucketInsertionsSinceCleanup = 0

    async run<T>(operation: AuthOperation, ip: string, action: () => Promise<T>): Promise<T> {
        if (this.activeOperations >= MAX_CONCURRENT_OPERATIONS) throw httpErrors.tooManyRequests()
        this.checkRate(operation, ip)

        this.activeOperations += 1
        try {
            return await action()
        } finally {
            this.activeOperations -= 1
        }
    }

    private checkRate(operation: AuthOperation, ip: string): void {
        const now = Date.now()
        const windowMs = operation === 'signin' ? SIGNIN_WINDOW_MS : SIGNUP_WINDOW_MS
        const limit = operation === 'signin' ? SIGNIN_ATTEMPTS_PER_WINDOW : SIGNUP_ATTEMPTS_PER_WINDOW
        const key = `${operation}:${ip}`
        const bucket = this.buckets.get(key)

        if (bucket === undefined || now - bucket.startedAt >= windowMs) {
            if (bucket === undefined && this.buckets.size >= MAX_TRACKED_BUCKETS) {
                this.bucketInsertionsSinceCleanup += 1
                if (this.bucketInsertionsSinceCleanup >= 256) {
                    this.removeExpiredBuckets(now)
                    this.bucketInsertionsSinceCleanup = 0
                }
                if (this.buckets.size >= MAX_TRACKED_BUCKETS) {
                    // Keep attacker-controlled peer diversity from growing this map without bound.
                    const oldestKey = this.buckets.keys().next().value
                    if (oldestKey !== undefined) this.buckets.delete(oldestKey)
                }
            }
            this.buckets.set(key, { startedAt: now, attempts: 1, expiresAt: now + windowMs })
            return
        }

        if (bucket.attempts >= limit) throw httpErrors.tooManyRequests()
        bucket.attempts += 1
    }

    private removeExpiredBuckets(now: number): void {
        for (const [key, bucket] of this.buckets) {
            if (bucket.expiresAt <= now) this.buckets.delete(key)
        }
    }
}
