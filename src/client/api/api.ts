import z, { ZodType } from 'zod'

import { getFrontConfig } from '../config'

export class HttpError extends Error {
    readonly method: string
    readonly url: string
    readonly status: number
    readonly statusText: string

    constructor(method: string, url: string, status: number, statusText: string) {
        super(`Not ok resp (${status} ${statusText}): ${method} ${url}`)
        this.method = method
        this.url = url
        this.status = status
        this.statusText = statusText
    }
}

export class Unauthorized extends HttpError {
    constructor(method: string, url: string, statusText: string) {
        super(method, url, 401, statusText)
    }
}

export class Forbidden extends HttpError {
    constructor(method: string, url: string, statusText: string) {
        super(method, url, 403, statusText)
    }
}

export class NotFound extends HttpError {
    constructor(method: string, url: string, statusText: string) {
        super(method, url, 404, statusText)
    }
}

function url(version: string, path: string, queryString: Record<string, string> | null): string {
    const domain = getFrontConfig().apiDomain

    const base = `${domain}api/${version}/${path}`
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

export interface AuthParam {
    userId: string
    tempPassword: string
}

export async function apiCall<T extends ZodType>(
    method: 'GET' | 'POST', version: string, path: string, auth: AuthParam | null,
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
        headers['authorization'] = `${auth.userId}:${auth.tempPassword}`
    }

    const u = url(version, path, queryString)
    const resp = await fetch(u, {
        method,
        headers,
        body
    })

    if (!resp.ok) {
        if (resp.status === 401) {
            throw new Unauthorized(method, u, resp.statusText)
        }

        if (resp.status === 403) {
            throw new Forbidden(method, u, resp.statusText)
        }

        if (resp.status === 404) {
            throw new NotFound(method, u, resp.statusText)
        }

        throw new HttpError(method, u, resp.status, resp.statusText)
    }

    if (resp.status === 204) {
        return validator.parse(undefined)
    }

    const json = await resp.json()

    return validator.parse(json)
}
