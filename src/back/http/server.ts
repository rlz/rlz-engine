import fastifyCompress from '@fastify/compress'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { fastifyResponseValidation } from '@fastify/response-validation'
import fastifySensible, { httpErrors } from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyPluginAsync,
    FastifyPluginCallback,
    RawReplyDefaultExpression,
    RawRequestDefaultExpression,
    RawServerBase
} from 'fastify'
import { type AcmeProvider, fastifyAcmeSecurePlugin, fastifyAcmeUnsecurePlugin, getCertAndKey } from 'fastify-acme'
import { createReadStream } from 'fs'
import { installIntoGlobal } from 'iterator-helpers-polyfill'
import path from 'path'

import { configureAjvFormats } from './ajv-formats.js'
import { type AuditLoggerConfig, initAuditLogger } from '../logger/audit-logger.js'
import { getSystemLogger } from '../logger/system-logger.js'

const DEFAULT_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_AUDIT_MAX_RECORDS = 100_000

installIntoGlobal()

export interface RunServerParams {
    production: boolean
    debug?: boolean
    unsecurePort?: number
    securePort?: number
    domain: string
    certDir: string
    /** Audit retention age, in milliseconds. Defaults to 30 days. */
    auditRetentionMs?: number
    /** Global maximum audit record count. Defaults to 100,000. */
    auditMaxRecords?: number
    /** Also persist audit records in SQLite while using the console sink. */
    auditSqlite?: boolean
    /** Certificate authority used for ACME issuance and renewal. Defaults to Let's Encrypt. */
    acmeProvider?: AcmeProvider
    staticDir: string
    /** Application routes and integrations, installed on each server instance. */
    plugins?: readonly (FastifyPluginAsync | FastifyPluginCallback)[]
}

export async function runServer({
    production,
    debug = false,
    domain,
    certDir,
    auditRetentionMs = DEFAULT_AUDIT_RETENTION_MS,
    auditMaxRecords = DEFAULT_AUDIT_MAX_RECORDS,
    auditSqlite = false,
    acmeProvider,
    staticDir,
    securePort,
    unsecurePort,
    plugins = []
}: RunServerParams): Promise<() => Promise<void>> {
    const sqliteConfig = { path: path.resolve('logs.sqlite'), retentionMs: auditRetentionMs, maxRecords: auditMaxRecords }
    const auditLoggerConfig: AuditLoggerConfig =
        production && !debug
            ? { mode: 'sqlite', ...sqliteConfig }
            : auditSqlite
              ? { mode: 'sqlite+console', ...sqliteConfig }
              : { mode: 'console' }
    const closeAuditLogger = initAuditLogger(auditLoggerConfig)
    try {
        const L = getSystemLogger('init', { debug })
        L.info({ production }, 'runServer')

        const httpServer = fastify({
            loggerInstance: getSystemLogger('http', { debug }) as FastifyBaseLogger,
            ajv: {
                plugins: [configureAjvFormats],
                customOptions: { useDefaults: false, coerceTypes: false, allErrors: true, verbose: true }
            }
        })
        if (!production) {
            await httpServer.register(fastifyCookie)
            await httpServer.register(fastifyCors, {
                methods: ['get', 'post']
            })
            await httpServer.register(fastifyCompress)
            await httpServer.register(fastifySensible)
            await httpServer.register(fastifyResponseValidation, {
                ajv: { plugins: [configureAjvFormats], useDefaults: false, coerceTypes: false, allErrors: true, verbose: true }
            })

            await registerPlugins(httpServer, plugins)

            addStaticEndpoints(httpServer, staticDir)

            await httpServer.listen({ port: unsecurePort ?? 8080 })
            return async () => {
                try {
                    await httpServer.close()
                } finally {
                    closeAuditLogger()
                }
            }
        }

        httpServer.register(fastifyAcmeUnsecurePlugin, { redirectDomain: domain })
        await httpServer.listen({ port: unsecurePort ?? 80, host: '::' })

        L.info('Get certificates')

        const certAndKey = await getCertAndKey(certDir, domain, httpServer.log, acmeProvider)

        L.info('Init secure server')

        const httpsServer = fastify({
            http2: true,
            https: {
                allowHTTP1: true,
                cert: certAndKey.cert,
                key: certAndKey.pkey
            },
            loggerInstance: getSystemLogger('https', { debug }) as FastifyBaseLogger,
            ajv: {
                plugins: [configureAjvFormats],
                customOptions: { useDefaults: false, coerceTypes: false, allErrors: true, verbose: true }
            }
        })

        await httpsServer.register(fastifyCookie)

        await httpsServer.register(fastifyAcmeSecurePlugin, {
            certDir,
            domain,
            provider: acmeProvider
        })

        await httpsServer.register(fastifyCompress)
        await httpsServer.register(fastifySensible)
        await httpsServer.register(fastifyResponseValidation, {
            ajv: { plugins: [configureAjvFormats], useDefaults: false, coerceTypes: false, allErrors: true, verbose: true }
        })

        await registerPlugins(httpsServer, plugins)

        httpsServer.all('/rpc/*', async () => {
            return httpErrors.notFound()
        })

        addStaticEndpoints(httpsServer, staticDir)
        await httpsServer.listen({ port: securePort ?? 443, host: '::' })

        L.info('runServer done')
        return async () => {
            try {
                await Promise.all([httpServer.close(), httpsServer.close()])
            } finally {
                closeAuditLogger()
            }
        }
    } catch (error) {
        closeAuditLogger()
        throw error
    }
}

async function registerPlugins<S extends RawServerBase>(
    server: FastifyInstance<S, RawRequestDefaultExpression<S>, RawReplyDefaultExpression<S>, FastifyBaseLogger>,
    plugins: readonly (FastifyPluginAsync | FastifyPluginCallback)[]
) {
    for (const plugin of plugins) {
        await server.register(plugin)
    }
}

function addStaticEndpoints<S extends RawServerBase>(
    server: FastifyInstance<S, RawRequestDefaultExpression<S>, RawReplyDefaultExpression<S>, FastifyBaseLogger>,
    staticPath: string
) {
    const absStaticPath = path.resolve(staticPath)
    const absIndexPath = path.join(absStaticPath, 'index.html')

    server.register((s) => {
        s.register(fastifyStatic, { root: absStaticPath })
        s.setNotFoundHandler(async (_req, resp) => {
            await resp.type('text/html').send(createReadStream(absIndexPath))
        })
    })
}
