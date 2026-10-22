import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getAuditLogger, initAuditLogger } from '../src/back/logger/audit-logger.js'
import { formatAuditRecord } from '../src/back/logger/format.js'
import { LOGGER_MODULE } from '../src/back/logger/module.js'
import { readAuditLogFile } from '../src/back/logger/sqlite-storage.js'
import { rlzEngine } from '../src/back/engine.js'

describe('logger CLI', () => {
    let workingDirectory: string | undefined
    let closeLogger: (() => void) | undefined

    afterEach(async () => {
        closeLogger?.()
        closeLogger = undefined
        vi.restoreAllMocks()
        if (workingDirectory !== undefined) {
            await rm(workingDirectory, { recursive: true, force: true })
            workingDirectory = undefined
        }
    })

    it('prints filtered SQLite records as JSON', async () => {
        workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-logger-cli-'))
        closeLogger = initAuditLogger({
            mode: 'sqlite',
            path: join(workingDirectory, 'logs.sqlite'),
            retentionMs: 60_000,
            maxRecords: 100,
            cleanupIntervalMs: 60_000
        })
        getAuditLogger('APP').info({ type: 'user.created', userId: 'user-1', source: 'signup' })
        getAuditLogger('APP').error({ type: 'user.failed', userId: 'user-2' })
        getAuditLogger('OTHER').info({ type: 'request.completed' })
        closeLogger()
        closeLogger = undefined

        let output = ''
        vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
            output += String(chunk)
            return true
        }) as typeof process.stdout.write)

        const cliModule = LOGGER_MODULE.makeCli(workingDirectory)
        await cliModule.commands.logs.handler(
            {
                database: 'logs.sqlite',
                module: 'APP',
                level: 'info',
                limit: 100,
                offset: 0
            },
            await rlzEngine()
        )

        const expectedPage = readAuditLogFile(join(workingDirectory, 'logs.sqlite'), {
            module: 'APP',
            level: 'info',
            limit: 100,
            offset: 0
        })
        expect(output).toBe(expectedPage.records.map((record) => formatAuditRecord(record)).join(''))
        expect(output).toContain('\u001b[32m')
        expect(output).toContain('\n    userId:')
        expect(output).toContain('\n    source:')
    })
})
