import z, { ZodType } from 'zod'

import { ApiAuthResponseV0 } from '../../server/auth/api'
import { PRODUCTION } from '../../server/config'

const API_DOMAIN = PRODUCTION ? '/' : 'http://localhost:8080/'

export class Forbidden extends Error {
    constructor(url: string) {
        super(`Forbidden: ${url}`)
    }
}

function url(path: string, queryString: Record<string, string> | null): string {
    const base = `${API_DOMAIN}api/v0/${path}`
    if (queryString === null) {
        return base
    }

    const query = Object.entries(queryString)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')

    return `${base}?${query}`
}

const GZIP_THRESHOLD = 16 * 1024

async function prepareBody(request: object): Promise<Blob | string> {
    const textBody = JSON.stringify(request)
    if (textBody.length <= GZIP_THRESHOLD) {
        return textBody
    }

    const bodyStream = new Blob([textBody]).stream()

    const bodyStreamCompressed = bodyStream.pipeThrough(new CompressionStream('gzip'))
    return new Response(bodyStreamCompressed).blob()
}

export async function apiCall<T extends ZodType>(
    method: string, path: string, auth: ApiAuthResponseV0 | null,
    queryString: Record<string, string> | null,
    request: object | null, validator: T
): Promise<z.infer<T>> {
    const headers: Record<string, string> = {}

    const body = request === null ? undefined : await prepareBody(request)

    if (body !== undefined) {
        headers['content-type'] = 'application/json'
        if (typeof body !== 'string') {
            headers['content-encoding'] = 'gzip'
        }
    }

    if (auth !== null) {
        headers['authorization'] = `${auth.id}:${auth.tempPassword}`
    }

    const u = url(path, queryString)
    const resp = await fetch(u, {
        method,
        headers,
        body
    })

    if (!resp.ok) {
        if (resp.status === 403) {
            throw new Forbidden(u)
        }
        throw Error(`Not ok resp (${resp.status} ${resp.statusText}): ${method} ${u}`)
    }

    if (resp.status === 204) {
        return validator.parse(undefined)
    }

    const json = await resp.json()

    return validator.parse(json)
}
