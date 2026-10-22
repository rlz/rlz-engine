import fastifyCompress from '@fastify/compress'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { fastifyResponseValidation } from '@fastify/response-validation'
import fastifySensible, { httpErrors } from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import fastify, { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase } from 'fastify'
import { type AcmeProvider, fastifyAcmeSecurePlugin, fastifyAcmeUnsecurePlugin, getCertAndKey } from 'fastify-acme'
import { createReadStream } from 'fs'
import { installIntoGlobal } from 'iterator-helpers-polyfill'
import path from 'path'
import z from 'zod'

import { configureAjvFormats } from './ajv-formats.js'
import type { AdmRpc, Rpc } from '../rpc/rpc.js'
import { verifyAdminSecret } from '../auth/admin-secret.js'
import type { RpcRequestContext } from '../rpc/rpc.js'
import { addRequestBodyRedactionHook } from './request-logging.js'
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
    rpc: readonly Rpc[]
    admRpc: readonly AdmRpc[]
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
    rpc,
    admRpc
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
        addRequestBodyRedactionHook(httpServer)
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

            await registerRpcRoutes(httpServer, rpc, admRpc)

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
        addRequestBodyRedactionHook(httpsServer)

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

        await registerRpcRoutes(httpsServer, rpc, admRpc)

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

export async function registerRpcRoutes<S extends RawServerBase>(
    server: FastifyInstance<S, RawRequestDefaultExpression<S>, RawReplyDefaultExpression<S>, FastifyBaseLogger>,
    rpc: readonly Rpc[],
    admRpc: readonly AdmRpc[]
) {
    for (const group of rpc) {
        for (const endpoint of group.endpoints) {
            server.post(
                `/rpc/${group.name}_${endpoint.name}_v${endpoint.v}`,
                endpointSchemas(endpoint.bodySchema, endpoint.respSchema),
                async (request, reply) => {
                    const context = makeRpcContext(request, reply)
                    const body = request.body as object
                    const response =
                        'cookieAuth' in endpoint
                            ? await runCookieAuthEndpoint(endpoint, body, context)
                            : await endpoint.action(body, context)
                    await reply.send(response)
                }
            )
        }
    }
    for (const builder of admRpc) {
        for (const endpoint of builder.endpoints) {
            server.post(
                `/.adm/rpc/${builder.name}_${endpoint.name}_v${endpoint.v}`,
                endpointSchemas(endpoint.bodySchema, endpoint.respSchema),
                async (request, reply) => {
                    const authHeader = request.headers.authorization
                    const match = authHeader === undefined ? null : /^Bearer\s+(.+)$/i.exec(authHeader)
                    if (match === null || !(await verifyAdminSecret(match[1]))) throw httpErrors.forbidden()
                    await reply.send(await endpoint.action(request.body as object))
                }
            )
        }
    }
}

function endpointSchemas(bodySchema: z.ZodType, respSchema: z.ZodType) {
    return {
        schema: {
            body: bodySchema.toJSONSchema({ target: 'draft-07' }),
            response: { 200: respSchema.toJSONSchema({ target: 'draft-07' }) }
        }
    }
}

function makeRpcContext(
    request: {
        headers: RpcRequestContext['request']['headers']
        cookies?: RpcRequestContext['request']['cookies']
        protocol: 'http' | 'https'
        ip: string
    },
    reply: {
        setCookie: RpcRequestContext['reply']['setCookie']
        clearCookie: RpcRequestContext['reply']['clearCookie']
    }
): RpcRequestContext {
    return {
        request: {
            headers: request.headers,
            cookies: request.cookies ?? {},
            protocol: request.protocol,
            ip: request.ip
        },
        reply: {
            setCookie: (name, value, options) => {
                reply.setCookie(name, value, options)
            },
            clearCookie: (name, options) => {
                reply.clearCookie(name, options)
            }
        }
    }
}

async function runCookieAuthEndpoint(
    endpoint: Extract<Rpc['endpoints'][number], { cookieAuth: unknown }>,
    body: object,
    context: RpcRequestContext
) {
    const user = await endpoint.cookieAuth.authenticate(context)
    await endpoint.cookieAuth.verifyCsrf(context, user)
    return endpoint.action(user, body, context)
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
