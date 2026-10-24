import z from 'zod'

import { admRpc } from '../rpc/rpc.js'
import { getAuditLogReader, type AuditLogQuery, type LogLevel } from './audit-logger.js'

const auditLogQuerySchema = z.object({
    from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
        .optional(),
    to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
        .optional(),
    module: z.string().min(1).optional(),
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    minLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional()
})

const auditLogPageSchema = z.object({
    records: z.array(
        z.object({
            id: z.number().int().nonnegative(),
            time: z.string(),
            level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
            module: z.string(),
            type: z.string(),
            data: z.record(z.string(), z.unknown()).optional(),
            error: z.object({ name: z.string(), message: z.string(), stack: z.string().optional() }).optional()
        })
    ),
    total: z.number().int().nonnegative()
})

/** Creates the administrative endpoint for browsing the active SQLite audit log. */
export function makeAuditLogAdmRpc() {
    return admRpc('audit').add({
        name: 'logs',
        v: 1,
        bodySchema: auditLogQuerySchema,
        respSchema: auditLogPageSchema,
        action: (body) => getAuditLogReader().read(toAuditLogQuery(body))
    })
}

function toAuditLogQuery(body: z.infer<typeof auditLogQuerySchema>): AuditLogQuery {
    return {
        ...(body.from === undefined ? {} : { from: body.from }),
        ...(body.to === undefined ? {} : { to: body.to }),
        ...(body.module === undefined ? {} : { module: body.module }),
        ...(body.level === undefined ? {} : { level: body.level as LogLevel }),
        ...(body.minLevel === undefined ? {} : { minLevel: body.minLevel as LogLevel }),
        limit: body.limit ?? 100,
        offset: body.offset ?? 0
    }
}
