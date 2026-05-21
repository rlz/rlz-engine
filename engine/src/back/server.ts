import fastifyCompress from '@fastify/compress'
import fastifyCors from '@fastify/cors'
import { fastifyResponseValidation } from '@fastify/response-validation'
import fastifySensible, { httpErrors } from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import { Ajv } from 'ajv'
import formatsPlugin from 'ajv-formats'
import fastify, { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase } from 'fastify'
import { fastifyAcmeSecurePlugin, fastifyAcmeUnsecurePlugin, getCertAndKey } from 'fastify-acme'
import { createReadStream } from 'fs'
import { installIntoGlobal } from 'iterator-helpers-polyfill'
import path from 'path'
import { Logger } from 'pino'

import { logger } from './logger.js'

installIntoGlobal()

export type InitServerFuncType = <S extends RawServerBase>(
    server: FastifyInstance<
        S,
        RawRequestDefaultExpression<S>,
        RawReplyDefaultExpression<S>,
        Logger
    >
) => Promise<void>

export interface RunServerParams {
    production: boolean
    unsecurePort?: number
    securePort?: number
    domain: string
    certDir: string
    staticDir: string
    init: InitServerFuncType
}

const L = logger('init')

export async function runServer({ production, domain, certDir, staticDir, securePort, unsecurePort, init }: RunServerParams): Promise<() => Promise<void>> {
    L.info({ production }, 'runServer')

    const httpServer = fastify({
        loggerInstance: logger('http'),
        ajv: { plugins: [formatsPlugin.default as (opts: unknown) => Ajv], customOptions: { useDefaults: false, coerceTypes: false, allErrors: true, verbose: true } }
    })

    if (!production) {
        await httpServer.register(fastifyCors, {
            methods: ['get', 'post']
        })
        await httpServer.register(fastifyCompress)
        await httpServer.register(fastifySensible)
        await httpServer.register(fastifyResponseValidation, {
            ajv: { plugins: [formatsPlugin.default], useDefaults: false, coerceTypes: false, allErrors: true, verbose: true }
        })

        await init(httpServer)

        httpServer.all('/api/*', async () => {
            return httpErrors.notFound()
        })

        addStaticEndpoints(httpServer, staticDir)

        await httpServer.listen({ port: unsecurePort ?? 8080 })
        return async () => {
            await httpServer.close()
        }
    }

    httpServer.register(fastifyAcmeUnsecurePlugin, { redirectDomain: domain })
    await httpServer.listen({ port: unsecurePort ?? 80, host: '::' })

    L.info('Get certificates')

    const certAndKey = await getCertAndKey(certDir, domain)

    L.info('Init secure server')

    const httpsServer = fastify({
        http2: true,
        https: {
            allowHTTP1: true,
            cert: certAndKey.cert,
            key: certAndKey.pkey
        },
        loggerInstance: logger('https'),
        ajv: { plugins: [formatsPlugin.default as (opts: unknown) => Ajv], customOptions: { useDefaults: false, coerceTypes: false, allErrors: true, verbose: true } }
    })

    await httpsServer.register(fastifyAcmeSecurePlugin, {
        certDir,
        domain
    })

    await httpsServer.register(fastifyCors, {
        methods: ['get', 'post']
    })
    await httpsServer.register(fastifyCompress)
    await httpsServer.register(fastifySensible)
    await httpsServer.register(fastifyResponseValidation, { ajv: { plugins: [formatsPlugin.default], useDefaults: false, coerceTypes: false, allErrors: true, verbose: true } })

    await init(httpsServer)

    httpsServer.all('/api/*', async () => {
        return httpErrors.notFound()
    })

    httpsServer.all('/rpc/*', async () => {
        return httpErrors.notFound()
    })

    addStaticEndpoints(httpsServer, staticDir)
    await httpsServer.listen({ port: securePort ?? 443, host: '::' })

    L.info('runServer done')
    return async () => {
        await Promise.all([
            httpServer.close(),
            httpsServer.close()
        ])
    }
}

function addStaticEndpoints<S extends RawServerBase>(
    server: FastifyInstance<
        S,
        RawRequestDefaultExpression<S>,
        RawReplyDefaultExpression<S>,
        Logger
    >,
    staticPath: string
) {
    const absStaticPath = path.resolve(staticPath)
    const absIndexPath = path.join(absStaticPath, 'index.html')

    server.register((s) => {
        s.register(fastifyStatic, { root: absStaticPath })
        s.setNotFoundHandler(async (_req, resp) => {
            await resp.type('text/html')
                .send(createReadStream(absIndexPath))
        })
    })
}
