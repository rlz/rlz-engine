import type { FastifyBaseLogger, FastifyLogFn } from 'fastify'

import { PRODUCTION } from '../config.js'
import type { LogLevel } from './audit-logger.js'
import { getAuditLogger } from './audit-logger.js'

type Bindings = Parameters<FastifyBaseLogger['child']>[0]
type ChildLoggerOptions = Parameters<FastifyBaseLogger['child']>[1]

interface NormalizedLog {
    message: string
    data?: Record<string, unknown>
    error?: Error
}

const LEVELS: Record<LogLevel, number> = { fatal: 60, error: 50, warn: 40, info: 30, debug: 20, trace: 10 }

export interface SystemLoggerConfig {
    debug?: boolean
}

/** Pino-compatible adapter for Fastify; application modules should use getAuditLogger directly. */
export class SystemLogger implements FastifyBaseLogger {
    private readonly bindingsValue: Bindings
    private readonly threshold: LogLevel
    private readonly audit = getAuditLogger('SYSTEM')
    readonly level: string

    constructor(
        private readonly name = 'SYSTEM',
        { debug = false }: SystemLoggerConfig = {},
        bindings: Bindings = {}
    ) {
        this.bindingsValue = bindings
        this.threshold = debug ? (PRODUCTION ? 'debug' : 'trace') : 'info'
        this.level = this.threshold
    }

    fatal: FastifyLogFn = this.makeLog('fatal')
    error: FastifyLogFn = this.makeLog('error')
    warn: FastifyLogFn = this.makeLog('warn')
    info: FastifyLogFn = this.makeLog('info')
    debug: FastifyLogFn = this.makeLog('debug')
    trace: FastifyLogFn = this.makeLog('trace')
    silent: FastifyLogFn = (() => undefined) as FastifyLogFn

    child(bindings: Bindings, _options?: ChildLoggerOptions): FastifyBaseLogger {
        return new SystemLogger(this.name, { debug: this.threshold !== 'info' }, { ...this.bindingsValue, ...bindings })
    }

    private makeLog(level: LogLevel): FastifyLogFn {
        return ((obj: unknown, msg?: unknown, ...args: unknown[]) => this.log(level, obj, msg, args)) as FastifyLogFn
    }

    private log(level: LogLevel, obj: unknown, msg?: unknown, args: unknown[] = []): void {
        if (LEVELS[level] < LEVELS[this.threshold]) return
        const { message, data, error } = normalizeLog(obj, msg, args, this.bindingsValue)
        this.audit.write(level, message, { ...(data ?? {}), logger: this.name }, error)

        if (PRODUCTION) {
            const fields = data === undefined ? '' : ` ${formatFields(data)}`
            const stack = error?.stack?.replaceAll(/\s*\n\s*/g, ' | ')
            const errorText = error === undefined ? '' : ` ${error.name}: ${error.message}${stack ? ` ${stack}` : ''}`
            const singleLineMessage = message.replaceAll(/\s*[\r\n]+\s*/g, ' | ')
            process.stdout.write(
                `${new Date().toISOString()} ${level.toUpperCase()} [${this.name}] ${singleLineMessage}${fields}${errorText}\n`
            )
        }
    }
}

export function getSystemLogger(name: string, config?: SystemLoggerConfig): SystemLogger {
    return new SystemLogger(name, config)
}

function normalizeLog(obj: unknown, msg: unknown, args: unknown[], bindings: Bindings): NormalizedLog {
    const values = [obj, ...args]
    let message = typeof obj === 'string' ? obj : typeof msg === 'string' ? msg : ''
    if (typeof obj === 'string' && typeof msg === 'string') message = msg
    const data: Record<string, unknown> = { ...bindings }
    let error: Error | undefined
    for (const value of values) {
        if (value instanceof Error) error = value
        else if (isRecord(value)) Object.assign(data, value)
    }
    if (typeof obj !== 'string' && typeof msg === 'string') message = msg
    if (!message) message = error?.message ?? 'Log record'
    return { message, ...(Object.keys(data).length ? { data: jsonSafe(data) } : {}), ...(error ? { error } : {}) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonSafe(data: Record<string, unknown>): Record<string, unknown> {
    try {
        return JSON.parse(JSON.stringify(data)) as Record<string, unknown>
    } catch {
        return { serializationError: 'Structured log data was not JSON-serializable' }
    }
}

function formatFields(data: Record<string, unknown>): string {
    return Object.entries(data)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
}
