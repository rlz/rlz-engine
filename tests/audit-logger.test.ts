import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { getAuditLogger, getAuditLogReader, initAuditLogger } from '../src/back/logger/audit-logger.js'
import { SystemLogger } from '../src/back/logger/system-logger.js'

type AppEvent = { type: 'user.registered'; userId: string } | { type: 'payment.failed'; userId: string; reason: string }

describe('audit logger', () => {
    let workingDirectory: string | undefined
    let closeLogger: (() => void) | undefined

    afterEach(async () => {
        closeLogger?.()
        closeLogger = undefined
        if (workingDirectory !== undefined) {
            await rm(workingDirectory, { recursive: true, force: true })
            workingDirectory = undefined
        }
    })

    it('activates previously created typed loggers after initialization and returns to no-op after close', async () => {
        const audit = getAuditLogger<AppEvent>('APP')
        audit.info({ type: 'user.registered', userId: 'user-1' })

        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-audit-'))
        closeLogger = initAuditLogger({
            mode: 'sqlite',
            path: join(workingDirectory, 'logs.sqlite'),
            retentionMs: 60_000,
            maxRecords: 100,
            cleanupIntervalMs: 60_000
        })

        audit.info({ type: 'user.registered', userId: 'user-1' })
        const reader = getAuditLogReader()
        const page = reader.read({ limit: 10, offset: 0 })

        expect(page.total).toBe(1)
        expect(page.records[0]).toMatchObject({
            level: 'info',
            module: 'APP',
            type: 'user.registered',
            data: { userId: 'user-1' }
        })
        expect(page.records[0]).not.toHaveProperty('message')

        closeLogger()
        closeLogger = undefined
        audit.info({ type: 'payment.failed', userId: 'user-1', reason: 'declined' })
        expect(reader.read({ limit: 10, offset: 0 })).toEqual({ records: [], total: 0 })
    })

    it('filters stored events by module and level', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-audit-'))
        closeLogger = initAuditLogger({
            mode: 'sqlite',
            path: join(workingDirectory, 'logs.sqlite'),
            retentionMs: 60_000,
            maxRecords: 100,
            cleanupIntervalMs: 60_000
        })

        getAuditLogger<AppEvent>('APP').info({ type: 'user.registered', userId: 'user-1' })
        getAuditLogger<AppEvent>('APP').error({ type: 'payment.failed', userId: 'user-2', reason: 'declined' })
        getAuditLogger<AppEvent>('OTHER').info({ type: 'user.registered', userId: 'user-3' })

        expect(getAuditLogReader().read({ module: 'APP', level: 'error', limit: 10, offset: 0 })).toMatchObject({
            total: 1,
            records: [{ type: 'payment.failed', module: 'APP', level: 'error' }]
        })
    })

    it('stores untyped SystemLogger messages as event types with logger bindings', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-audit-'))
        closeLogger = initAuditLogger({
            mode: 'sqlite',
            path: join(workingDirectory, 'logs.sqlite'),
            retentionMs: 60_000,
            maxRecords: 100,
            cleanupIntervalMs: 60_000
        })

        const logger = new SystemLogger('http', { debug: true })
        logger.info({ requestId: 'request-1' }, 'request completed')

        expect(getAuditLogReader().read({ module: 'SYSTEM', limit: 10, offset: 0 })).toMatchObject({
            total: 1,
            records: [
                {
                    type: 'request completed',
                    data: { requestId: 'request-1', logger: 'http' }
                }
            ]
        })
    })
})
