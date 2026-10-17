import { chmodSync, closeSync, openSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import type { AuditLogEntry, AuditLogPage, AuditLogQuery, AuditRecord } from './audit-logger.js'

export interface SqliteAuditStorageOptions {
    path: string
    retentionMs: number
    maxRecords: number
    cleanupIntervalMs?: number
    onError?: (error: unknown) => void
}

const CLEANUP_MARGIN_MAX = 1000

/** Synchronous SQLite writer for the single-process application deployment model. */
export class SqliteAuditStorage {
    private readonly db: DatabaseSync
    private readonly insertRecord
    private readonly deleteExpired
    private readonly countRecords
    private readonly deleteOldest
    private readonly timer: NodeJS.Timeout
    private readonly onError: (error: unknown) => void

    constructor(private readonly options: SqliteAuditStorageOptions) {
        if (!Number.isFinite(options.retentionMs) || options.retentionMs <= 0) {
            throw new RangeError('Audit retention must be a positive finite number of milliseconds')
        }
        if (!Number.isSafeInteger(options.maxRecords) || options.maxRecords < 1) {
            throw new RangeError('Audit maximum record count must be a positive safe integer')
        }
        this.onError = options.onError ?? reportStorageError
        const fd = openSync(options.path, 'a', 0o600)
        closeSync(fd)
        chmodSync(options.path, 0o600)
        this.db = new DatabaseSync(options.path)
        try {
            this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    time TEXT NOT NULL,
                    level TEXT NOT NULL,
                    module TEXT NOT NULL,
                    message TEXT NOT NULL,
                    data TEXT,
                    error TEXT
                ) STRICT;
                CREATE INDEX IF NOT EXISTS audit_logs_time_id ON audit_logs (time, id);
                CREATE INDEX IF NOT EXISTS audit_logs_module_time_id ON audit_logs (module, time, id);
                CREATE INDEX IF NOT EXISTS audit_logs_level_time_id ON audit_logs (level, time, id);
                CREATE INDEX IF NOT EXISTS audit_logs_module_level_time_id ON audit_logs (module, level, time, id);
            `)
            this.insertRecord = this.db.prepare(`
                INSERT INTO audit_logs (time, level, module, message, data, error)
                VALUES (?, ?, ?, ?, ?, ?)
            `)
            this.deleteExpired = this.db.prepare('DELETE FROM audit_logs WHERE time < ?')
            this.countRecords = this.db.prepare('SELECT COUNT(*) AS count FROM audit_logs')
            this.deleteOldest = this.db.prepare(`
                DELETE FROM audit_logs WHERE id IN (
                    SELECT id FROM audit_logs ORDER BY time ASC, id ASC LIMIT ?
                )
            `)

            this.cleanup()
            this.timer = setInterval(() => this.cleanupSafely(), options.cleanupIntervalMs ?? 60 * 60 * 1000)
            this.timer.unref()
        } catch (error) {
            this.db.close()
            throw error
        }
    }

    write(record: AuditRecord): void {
        this.insertRecord.run(
            record.time,
            record.level,
            record.module,
            record.message,
            record.data === undefined ? null : JSON.stringify(record.data),
            record.error === undefined ? null : JSON.stringify(record.error)
        )
    }

    read(query: AuditLogQuery): AuditLogPage {
        validatePage(query)
        const from = query.from === undefined ? undefined : normalizeTime(query.from, 'from')
        const to = query.to === undefined ? undefined : normalizeTime(query.to, 'to')
        if (from !== undefined && to !== undefined && from > to) {
            throw new RangeError('Audit query from must not be later than to')
        }
        const conditions: string[] = []
        const values: (string | number)[] = []
        if (from !== undefined) {
            conditions.push('time >= ?')
            values.push(from)
        }
        if (to !== undefined) {
            conditions.push('time <= ?')
            values.push(to)
        }
        if (query.module !== undefined) {
            conditions.push('module = ?')
            values.push(query.module)
        }
        if (query.level !== undefined) {
            conditions.push('level = ?')
            values.push(query.level)
        }

        const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
        const count = this.db.prepare(`SELECT COUNT(*) AS count FROM audit_logs ${where}`).get(...values) as { count: number }
        const rows = this.db
            .prepare(
                `
            SELECT id, time, level, module, message, data, error
            FROM audit_logs ${where}
            ORDER BY time DESC, id DESC
            LIMIT ? OFFSET ?
        `
            )
            .all(...values, query.limit, query.offset) as unknown as StoredAuditRow[]

        return { records: rows.map(toAuditLogEntry), total: count.count }
    }

    close(): void {
        clearInterval(this.timer)
        this.db.close()
    }

    private cleanupSafely(): void {
        try {
            this.cleanup()
        } catch (error) {
            this.onError(error)
        }
    }

    private cleanup(): void {
        const cutoff = new Date(Date.now() - this.options.retentionMs).toISOString()
        this.deleteExpired.run(cutoff)

        const countRow = this.countRecords.get() as { count: number }
        if (countRow.count <= this.options.maxRecords) return

        const margin = Math.min(CLEANUP_MARGIN_MAX, Math.max(1, Math.floor(this.options.maxRecords * 0.01)), this.options.maxRecords - 1)
        const targetCount = Math.max(0, this.options.maxRecords - margin)
        this.deleteOldest.run(countRow.count - targetCount)
    }
}

interface StoredAuditRow {
    id: number
    time: string
    level: AuditRecord['level']
    module: string
    message: string
    data: string | null
    error: string | null
}

function toAuditLogEntry(row: StoredAuditRow): AuditLogEntry {
    return {
        id: row.id,
        time: row.time,
        level: row.level,
        module: row.module,
        message: row.message,
        ...(row.data === null ? {} : { data: JSON.parse(row.data) as Record<string, unknown> }),
        ...(row.error === null ? {} : { error: JSON.parse(row.error) as AuditRecord['error'] })
    }
}

function validatePage(query: AuditLogQuery): void {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 1000) {
        throw new RangeError('Audit page limit must be an integer between 1 and 1000')
    }
    if (!Number.isSafeInteger(query.offset) || query.offset < 0) {
        throw new RangeError('Audit page offset must be a non-negative safe integer')
    }
}

function normalizeTime(value: string, field: 'from' | 'to'): string {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) throw new RangeError(`Audit query ${field} must be a valid date`)
    return date.toISOString()
}

function reportStorageError(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    process.stderr.write(`AuditLogger SQLite maintenance error: ${message.replaceAll(/\s*\n\s*/g, ' | ')}\n`)
}
