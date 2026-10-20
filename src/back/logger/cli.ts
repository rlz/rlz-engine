import { number, oneOf, option, optional, string } from 'cmd-ts'
import { resolve } from 'node:path'

import { cliCommand, type CliModule } from '../cli/cli-engine.js'
import { formatAuditRecord } from './format.js'
import { readAuditLogFile } from './sqlite-storage.js'

const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const

export function makeAuditLogCliModule(workingDirectory: string | (() => string) = () => process.cwd()): CliModule {
    return {
        name: 'logger',
        description: 'Read and inspect persisted audit logs.',
        commands: {
            logs: cliCommand({
                description: 'Read audit records from a SQLite database with optional filters.',
                args: {
                    database: option({
                        long: 'database',
                        type: string,
                        defaultValue: () => 'logs.sqlite',
                        description: 'SQLite database path, relative to the application working directory.'
                    }),
                    from: option({ long: 'from', type: optional(string), description: 'Include records at or after this ISO timestamp.' }),
                    to: option({ long: 'to', type: optional(string), description: 'Include records at or before this ISO timestamp.' }),
                    module: option({ long: 'module', type: optional(string), description: 'Only include this logger module.' }),
                    level: option({ long: 'level', type: optional(oneOf(levels)), description: 'Only include this log level.' }),
                    limit: option({ long: 'limit', type: optional(number), description: 'Maximum records to return, from 1 to 1000.' }),
                    offset: option({ long: 'offset', type: optional(number), description: 'Number of matching records to skip.' })
                },
                handler: async ({ database, from, to, module, level, limit, offset }) => {
                    const directory = typeof workingDirectory === 'function' ? workingDirectory() : workingDirectory
                    const page = readAuditLogFile(resolve(directory, database), {
                        ...(from === undefined ? {} : { from }),
                        ...(to === undefined ? {} : { to }),
                        ...(module === undefined ? {} : { module }),
                        ...(level === undefined ? {} : { level }),
                        limit: limit ?? 100,
                        offset: offset ?? 0
                    })
                    process.stdout.write(page.records.map((record) => formatAuditRecord(record)).join(''))
                }
            })
        }
    }
}
