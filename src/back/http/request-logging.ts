import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase } from 'fastify'

const sensitiveFieldPattern = /password|token|secret|authorization/i

export function redactSensitiveRequestBody(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveRequestBody)
    }

    if (typeof value !== 'object' || value === null) {
        return value
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, fieldValue]) => [
            key,
            sensitiveFieldPattern.test(key) ? '[REDACTED]' : redactSensitiveRequestBody(fieldValue)
        ])
    )
}

function prepareRequestBodyForLogging(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || !Object.isExtensible(value)) {
        return value
    }

    Object.defineProperty(value, 'toJSON', {
        configurable: true,
        enumerable: false,
        value: () => redactSensitiveRequestBody(value)
    })

    return value
}

export function addRequestBodyRedactionHook<S extends RawServerBase>(
    server: FastifyInstance<S, RawRequestDefaultExpression<S>, RawReplyDefaultExpression<S>, FastifyBaseLogger>
): void {
    server.addHook('preValidation', async (request) => {
        request.body = prepareRequestBodyForLogging(request.body)
    })
}
