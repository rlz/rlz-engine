import fastify from 'fastify'
import formatsPlugin from 'ajv-formats'
import sensible from '@fastify/sensible'
import responseValidation from '@fastify/response-validation'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import z from 'zod'

import { generateAdmClient, generateClient } from '../src/back/rpc/gen.js'
import { writeAdminSecretHash } from '../src/back/auth/admin-secret.js'
import { getAuditLogger, initAuditLogger } from '../src/back/logger/audit-logger.js'
import { LOGGER_MODULE } from '../src/back/logger/module.js'
import { admRpc, rpc } from '../src/back/rpc/rpc.js'

describe('RPC contracts', () => {
    it('accepts Bearer credentials and rejects legacy or unsupported authorization schemes', async () => {
        const authenticatedUsers: string[] = []
        const builder = rpc('example').add({
            name: 'private',
            v: 1,
            bodySchema: z.object({}),
            respSchema: z.object({ userId: z.string() }),
            auth: (userId) => {
                authenticatedUsers.push(userId)
                return userId
            },
            action: (userId) => ({ userId })
        })
        const app = fastify({ ajv: { plugins: [formatsPlugin.default] } })
        await app.register(sensible)
        await app.register(responseValidation)
        await app.register(builder.makeFastifyPlugin())
        await app.ready()

        const legacy = await app.inject({
            method: 'POST',
            url: '/rpc/example_private_v1',
            headers: { authorization: 'user-1:password' },
            payload: {}
        })
        expect(legacy.statusCode).toBe(403)

        const bearer = await app.inject({
            method: 'POST',
            url: '/rpc/example_private_v1',
            headers: { authorization: 'Bearer user-2:password' },
            payload: {}
        })
        expect(bearer.statusCode).toBe(200)
        expect(bearer.json()).toEqual({ userId: 'user-2' })

        const unsupported = await app.inject({
            method: 'POST',
            url: '/rpc/example_private_v1',
            headers: { authorization: 'Basic user-3:password' },
            payload: {}
        })
        expect(unsupported.statusCode).toBe(403)
        expect(authenticatedUsers).toEqual(['user-2'])
        await app.close()
    })

    it('validates request and response bodies against endpoint schemas', async () => {
        const builder = rpc('example')
            .add({
                name: 'echo',
                v: 2,
                anonimous: true,
                bodySchema: z.object({ value: z.string() }),
                respSchema: z.object({ value: z.string() }),
                action: ({ value }) => ({ value })
            })
            .add({
                name: 'bad-response',
                v: 1,
                anonimous: true,
                bodySchema: z.object({}),
                respSchema: z.object({ value: z.string() }),
                action: () => ({ value: 42 }) as unknown as { value: string }
            })
        const app = fastify({ ajv: { customOptions: { useDefaults: false, coerceTypes: false, allErrors: true, verbose: true } } })
        await app.register(sensible)
        await app.register(responseValidation)
        await app.register(builder.makeFastifyPlugin())
        await app.ready()

        const valid = await app.inject({ method: 'POST', url: '/rpc/example_echo_v2', payload: { value: 'ok' } })
        expect(valid.statusCode).toBe(200)
        expect(valid.json()).toEqual({ value: 'ok' })

        const invalid = await app.inject({ method: 'POST', url: '/rpc/example_echo_v2', payload: { value: 42 } })
        expect(invalid.statusCode).toBe(400)

        const invalidResponse = await app.inject({ method: 'POST', url: '/rpc/example_bad-response_v1', payload: {} })
        expect(invalidResponse.statusCode).toBe(500)
        await app.close()
    })

    it('generates client methods and types from the registered endpoint contract', () => {
        const builder = rpc('example').add({
            name: 'echo',
            v: 2,
            anonimous: true,
            bodySchema: z.object({ value: z.string() }),
            respSchema: z.object({ accepted: z.boolean() }),
            action: () => ({ accepted: true })
        })

        const generated = generateClient('client.ts', builder)
        expect(generated).toContain('RpcBodyExampleEchoV2')
        expect(generated).toContain('RpcRespExampleEchoV2')
        expect(generated).toContain('echo: async (body: RpcBodyExampleEchoV2)')
        expect(generated).toContain('"example"')
        expect(generated).toContain('"echo"')
        expect(generated).toContain('2')
    })

    it('generates typed administrative client methods using the admin secret transport', () => {
        const builder = admRpc('audit').add({
            name: 'logs',
            v: 1,
            bodySchema: z.object({ limit: z.number().optional() }),
            respSchema: z.object({ total: z.number() }),
            action: () => ({ total: 0 })
        })

        const generated = generateAdmClient('admin-client.ts', builder)
        expect(generated).toContain('AdmAuthParam')
        expect(generated).toContain('admRpcCall')
        expect(generated).toContain('RpcBodyAuditLogsV1')
        expect(generated).toContain('RpcRespAuditLogsV1')
        expect(generated).toContain('logs: async (auth: AdmAuthParam, body: RpcBodyAuditLogsV1)')
        expect(generated).toContain('ADM_RPC_CLIENT')
    })

    it('protects administrative RPC routes with the admin Bearer secret', async () => {
        const workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-adm-rpc-'))
        const secret = 'a-valid-administrative-secret'
        await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), secret)

        const builder = admRpc('audit').add({
            name: 'status',
            v: 1,
            bodySchema: z.object({}),
            respSchema: z.object({ available: z.boolean() }),
            action: () => ({ available: true })
        })
        const app = fastify()
        await app.register(sensible)
        await app.register(responseValidation)
        await app.register(builder.makeFastifyPlugin(), { workingDirectory })
        await app.ready()

        try {
            const missing = await app.inject({ method: 'POST', url: '/.adm/rpc/audit_status_v1', payload: {} })
            expect(missing.statusCode).toBe(403)

            const legacy = await app.inject({
                method: 'POST',
                url: '/.adm/rpc/audit_status_v1',
                headers: { authorization: `${secret}:anything` },
                payload: {}
            })
            expect(legacy.statusCode).toBe(403)

            const valid = await app.inject({
                method: 'POST',
                url: '/.adm/rpc/audit_status_v1',
                headers: { authorization: `Bearer ${secret}` },
                payload: {}
            })
            expect(valid.statusCode).toBe(200)
            expect(valid.json()).toEqual({ available: true })
        } finally {
            await app.close()
            await rm(workingDirectory, { recursive: true, force: true })
        }
    })

    it('exposes filtered audit pages through the protected administrative RPC', async () => {
        const workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-audit-rpc-'))
        const secret = 'a-valid-audit-secret'
        await writeAdminSecretHash(join(workingDirectory, 'auth', 'admin-secret'), secret)
        const closeLogger = initAuditLogger({
            mode: 'sqlite',
            path: join(workingDirectory, 'logs.sqlite'),
            retentionMs: 60_000,
            maxRecords: 100,
            cleanupIntervalMs: 60_000
        })
        getAuditLogger('APP').info({ type: 'user.created', userId: 'user-1' })
        getAuditLogger('OTHER').error({ type: 'request.failed' })

        const app = fastify({ ajv: { plugins: [formatsPlugin.default] } })
        await app.register(sensible)
        await app.register(responseValidation)
        await app.register(LOGGER_MODULE.makeAdmRpc().makeFastifyPlugin(), { workingDirectory })
        await app.ready()

        try {
            const unauthorized = await app.inject({ method: 'POST', url: '/.adm/rpc/audit_logs_v1', payload: {} })
            expect(unauthorized.statusCode).toBe(403)

            const valid = await app.inject({
                method: 'POST',
                url: '/.adm/rpc/audit_logs_v1',
                headers: { authorization: `Bearer ${secret}` },
                payload: { module: 'APP', level: 'info' }
            })
            expect(valid.statusCode).toBe(200)
            expect(valid.json()).toMatchObject({
                total: 1,
                records: [{ module: 'APP', type: 'user.created', data: { userId: 'user-1' } }]
            })

            const invalidPageSize = await app.inject({
                method: 'POST',
                url: '/.adm/rpc/audit_logs_v1',
                headers: { authorization: `Bearer ${secret}` },
                payload: { limit: 1001 }
            })
            expect(invalidPageSize.statusCode).toBe(400)
        } finally {
            await app.close()
            closeLogger()
            await rm(workingDirectory, { recursive: true, force: true })
        }
    })
})
