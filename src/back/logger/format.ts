import { inspect } from 'node:util'

import type { AuditRecord, LogLevel } from './audit-logger.js'

const LEVEL_COLORS: Record<LogLevel, string> = {
    fatal: '\u001b[35m',
    error: '\u001b[31m',
    warn: '\u001b[33m',
    info: '\u001b[32m',
    debug: '\u001b[36m',
    trace: '\u001b[90m'
}

/** Formats an audit record for both the live console sink and the log-reading CLI. */
export function formatAuditRecord(record: AuditRecord, color = true): string {
    const prefix = `${record.time} ${record.level.toUpperCase()} [${record.module}]`
    const formattedPrefix = color ? `${LEVEL_COLORS[record.level]}${prefix}\u001b[0m` : prefix
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

    return `${formattedPrefix} ${record.type}${details}${error}\n`
}
