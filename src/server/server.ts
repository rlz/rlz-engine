import fastifyCompress from '@fastify/compress'
import fastifyCors from '@fastify/cors'
import fastifyResponseValidation from '@fastify/response-validation'
import fastifySensible from '@fastify/sensible'
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

export async function runServer({ production, domain, certDir, staticDir, init }: RunServerParams) {
    const httpServer = fastify({
        loggerInstance: logger('http'),
        ajv: { plugins: [formatsPlugin] }
    })

    if (!production) {
        await httpServer.register(fastifyCors, {
            methods: ['get', 'post']
        })
        await httpServer.register(fastifyCompress)
        await httpServer.register(fastifySensible)
        await httpServer.register(fastifyResponseValidation, {
            ajv: { plugins: [formatsPlugin] }
        })

        await init(httpServer)

        addStaticEndpoints(httpServer, staticDir)

        await httpServer.listen({ host: 'localhost', port: 8080 })
        return
    }

    httpServer.register(fastifyAcmeUnsecurePlugin, { redirectDomain: domain })
    await httpServer.listen({ port: 80 })

    const certAndKey = await getCertAndKey(certDir, domain)

    const httpsServer = fastify({
        http2: true,
        https: {
            allowHTTP1: true,
            cert: certAndKey.cert,
            key: certAndKey.pkey
        },
        loggerInstance: logger('https'),
        ajv: { plugins: [formatsPlugin] }
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
    await httpsServer.register(fastifyResponseValidation, { ajv: { plugins: [formatsPlugin] } })

    await init(httpsServer)

    addStaticEndpoints(httpsServer, staticDir)
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
