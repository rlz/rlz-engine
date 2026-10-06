import fastify from 'fastify'
import sensible from '@fastify/sensible'
import responseValidation from '@fastify/response-validation'
import { describe, expect, it } from 'vitest'
import z from 'zod'

import { generateClient } from '../src/back/rpc/gen.js'
import { rpc } from '../src/back/rpc/rpc.js'

describe('RPC contracts', () => {
    it('accepts Bearer and legacy credentials but rejects unsupported authorization schemes', async () => {
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
        const app = fastify()
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
        expect(legacy.statusCode).toBe(200)
        expect(legacy.json()).toEqual({ userId: 'user-1' })

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
        expect(authenticatedUsers).toEqual(['user-1', 'user-2'])
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
})
