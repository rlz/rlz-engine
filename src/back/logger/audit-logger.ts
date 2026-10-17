import { inspect } from 'node:util'

import { SqliteAuditStorage } from './sqlite-storage.js'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface AuditErrorRecord {
    name: string
    message: string
    stack?: string
}

export interface AuditRecord {
    time: string
    level: LogLevel
    module: string
    message: string
    data?: Record<string, unknown>
    error?: AuditErrorRecord
}

export interface AuditLogEntry extends AuditRecord {
    id: number
}

export interface AuditLogQuery {
    from?: string
    to?: string
    module?: string
    level?: LogLevel
    limit: number
    offset: number
}

export interface AuditLogPage {
    records: AuditLogEntry[]
    total: number
}

type AuditSink = (record: AuditRecord) => void

interface ConsoleAuditLoggerConfig {
    mode: 'console'
    color?: boolean
}

interface SqliteAuditLoggerConfig {
    mode: 'sqlite'
    path: string
    retentionMs: number
    maxRecords: number
    cleanupIntervalMs?: number
}

interface SqliteAndConsoleAuditLoggerConfig extends Omit<SqliteAuditLoggerConfig, 'mode'> {
    mode: 'sqlite+console'
    color?: boolean
}

export type AuditLoggerConfig = ConsoleAuditLoggerConfig | SqliteAuditLoggerConfig | SqliteAndConsoleAuditLoggerConfig

const COLORS: Record<LogLevel, string> = {
    fatal: '\u001b[35m',
    error: '\u001b[31m',
    warn: '\u001b[33m',
    info: '\u001b[32m',
    debug: '\u001b[36m',
    trace: '\u001b[90m'
}

let activeSink: AuditSink | undefined
let closeActiveSink: (() => void) | undefined
let activeReader: ((query: AuditLogQuery) => AuditLogPage) | undefined

/** Selects the shared audit output. Audit loggers remain no-op until this is called. */
export function initAuditLogger(config: AuditLoggerConfig): () => void {
    const previousClose = closeActiveSink
    activeSink = undefined
    closeActiveSink = undefined
    activeReader = undefined
    try {
        previousClose?.()
    } catch (error) {
        reportAuditError(error, 'shutdown failed')
    }

    try {
        let sink: AuditSink
        let close: () => void = () => undefined
        if (config.mode === 'console') {
            const color = config.color ?? true
            sink = (record) => {
                writeConsole(record, color)
            }
        } else {
            const storage = new SqliteAuditStorage(config)
            activeReader = (query) => storage.read(query)
            const withConsole = config.mode === 'sqlite+console'
            const color = config.mode === 'sqlite+console' ? (config.color ?? true) : false
            sink = (record) => {
                try {
                    storage.write(record)
                } catch (error) {
                    reportAuditError(error, 'write failed')
                }
                if (withConsole) writeConsole(record, color)
            }
            close = () => storage.close()
        }

        activeSink = sink
        closeActiveSink = close
        return () => {
            if (activeSink !== sink) return
            activeSink = undefined
            closeActiveSink = undefined
            activeReader = undefined
            try {
                close()
            } catch (error) {
                reportAuditError(error, 'shutdown failed')
            }
        }
    } catch (error) {
        reportAuditError(error, 'initialization failed')
        return () => undefined
    }
}

/** A module-scoped audit logger. Instances obtained before initAuditLogger become active after initialization. */
export class AuditLogger {
    constructor(private readonly module: string) {}

    fatal(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('fatal', message, data, error)
    }

    error(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('error', message, data, error)
    }

    warn(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('warn', message, data, error)
    }

    info(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('info', message, data, error)
    }

    debug(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('debug', message, data, error)
    }

    trace(message: string, data?: Record<string, unknown>, error?: Error): void {
        this.write('trace', message, data, error)
    }

    write(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
        if (activeSink === undefined) return
        const record: AuditRecord = {
            time: new Date().toISOString(),
            level,
            module: this.module,
            message,
            ...(data === undefined ? {} : { data }),
            ...(error === undefined ? {} : { error: { name: error.name, message: error.message, stack: error.stack } })
        }
        try {
            activeSink(record)
        } catch (sinkError) {
            reportAuditError(sinkError, 'write failed')
        }
    }
}

export function getAuditLogger(module: string): AuditLogger {
    return new AuditLogger(module)
}

/** Reads persisted audit records; console-only or uninitialized loggers return an empty page. */
export class AuditLogReader {
    read(query: AuditLogQuery): AuditLogPage {
        if (activeReader === undefined) return { records: [], total: 0 }
        return activeReader(query)
    }
}

export function getAuditLogReader(): AuditLogReader {
    return new AuditLogReader()
}

function writeConsole(record: AuditRecord, color: boolean): void {
    const prefix = `${record.time} ${record.level.toUpperCase()} [${record.module}]`
    const details =
        record.data === undefined
            ? ''
            : Object.entries(record.data)
                  .map(([key, value]) => {
                      const formattedValue = inspect(value, { colors: color, compact: true, depth: 1, breakLength: Infinity })
                      return `\n    ${key}: ${formattedValue.replaceAll('\n', '\n    ')}`
                  })
                  .join('')
    const error =
        record.error === undefined
            ? ''
            : `\n    error: ${(record.error.stack ?? `${record.error.name}: ${record.error.message}`).replaceAll('\n', '\n    ')}`
    process.stderr.write(`${color ? COLORS[record.level] : ''}${prefix}${color ? '\u001b[0m' : ''} ${record.message}${details}${error}\n`)
}

function reportAuditError(error: unknown, context: string): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    process.stderr.write(`AuditLogger ${context}: ${message.replaceAll(/[\r\n]+/g, ' | ')}\n`)
}
