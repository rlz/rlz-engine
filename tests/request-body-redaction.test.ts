import fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { addRequestBodyRedactionHook, redactSensitiveRequestBody } from '../src/back/http/request-logging.js'

describe('request body redaction', () => {
    it('redacts sensitive fields recursively without changing the request data', () => {
        const body = {
            domain: 'example.test',
            password: 'hidden',
            telegramBotToken: 'hidden',
            engines: [{ name: 'main', accessSecret: 'hidden', targets: ['target-id'] }]
        }

        const redacted = redactSensitiveRequestBody(body)

        expect(body.password).toBe('hidden')
        expect(redacted).toEqual({
            domain: 'example.test',
            password: '[REDACTED]',
            telegramBotToken: '[REDACTED]',
            engines: [{ name: 'main', accessSecret: '[REDACTED]', targets: ['target-id'] }]
        })
    })

    it('redacts data when Fastify serializes a request body', async () => {
        const server = fastify()
        addRequestBodyRedactionHook(server)
        server.post('/echo', async (request) => ({ body: request.body }))
        await server.ready()

        const response = await server.inject({
            method: 'POST',
            url: '/echo',
            payload: { password: 'hidden', nested: { authorization: 'Bearer hidden', value: 'visible' } }
        })

        expect(response.json()).toEqual({
            body: { password: '[REDACTED]', nested: { authorization: '[REDACTED]', value: 'visible' } }
        })
        await server.close()
    })
})
