import fastifyCompress from '@fastify/compress'
import fastifyCors from '@fastify/cors'
import fastifyResponseValidation from '@fastify/response-validation'
import fastifySensible, { httpErrors } from '@fastify/sensible'
import fastifyStatic from '@fastify/static'
import formatsPlugin from 'ajv-formats'
import fastify, { FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase } from 'fastify'
import { fastifyAcmeSecurePlugin, fastifyAcmeUnsecurePlugin, getCertAndKey } from 'fastify-acme'
import { createReadStream } from 'fs'
import { installIntoGlobal } from 'iterator-helpers-polyfill'
import path from 'path'
import { Logger } from 'pino'

import { logger } from './logger'

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
    domain: string
    certDir: string
    staticDir: string
    init: InitServerFuncType
}

const L = logger('init')

export async function runServer({ production, domain, certDir, staticDir, init }: RunServerParams) {
    L.info({ production }, 'runServer')

    const httpServer = fastify({
        loggerInstance: logger('http'),
        ajv: { plugins: [formatsPlugin], customOptions: { useDefaults: false } }
    })

    if (!production) {
        await httpServer.register(fastifyCors, {
            methods: ['get', 'post']
        })
        await httpServer.register(fastifyCompress)
        await httpServer.register(fastifySensible)
        await httpServer.register(fastifyResponseValidation, {
            ajv: { plugins: [formatsPlugin], useDefaults: false }
        })

        await init(httpServer)

        httpServer.all('/api/*', async () => {
            return httpErrors.notFound()
        })

        addStaticEndpoints(httpServer, staticDir)

        await httpServer.listen({ port: 8080 })
        return
    }

    httpServer.register(fastifyAcmeUnsecurePlugin, { redirectDomain: domain })
    await httpServer.listen({ port: 80, host: '::' })

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
        ajv: { plugins: [formatsPlugin], customOptions: { useDefaults: false } }
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
    await httpsServer.register(fastifyResponseValidation, { ajv: { plugins: [formatsPlugin], useDefaults: false } })

    await init(httpsServer)

    httpsServer.all('/api/*', async () => {
        return httpErrors.notFound()
    })

    addStaticEndpoints(httpsServer, staticDir)
    await httpsServer.listen({ port: 443, host: '::' })

    L.info('runServer done')
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
