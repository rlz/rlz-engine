import { DateTime, Duration } from 'luxon'

import { toValidDateTime } from '../shared/utils/datetime.js'
import { getCsrfToken, getFrontConfig } from './config.js'

export function encodeRpcDate(value: DateTime<true>): string {
    const iso = value.toISODate()
    if (iso === null) throw new TypeError('Could not serialize Luxon DateTime as RPC date')
    return iso
}

export function decodeRpcDate(value: string): DateTime<true> {
    return toValidDateTime(DateTime.fromISO(value, { zone: 'utc' }))
}

export function encodeRpcDateTime(value: DateTime<true>, precision: number | null = null): string {
    const utcValue = value.toUTC()
    if (precision === -1 && (utcValue.second !== 0 || utcValue.millisecond !== 0)) {
        throw new TypeError('RPC datetime precision is minutes, but the Luxon DateTime contains seconds')
    }
    if (precision === 0 && utcValue.millisecond !== 0) {
        throw new TypeError('RPC datetime precision is seconds, but the Luxon DateTime contains milliseconds')
    }
    if (precision === 1 || precision === 2) {
        const divisor = precision === 1 ? 100 : 10
        if (utcValue.millisecond % divisor !== 0) {
            throw new TypeError(`RPC datetime precision is ${precision} fractional digits, but the Luxon DateTime has finer precision`)
        }
    }
    const iso = utcValue.toISO({
        suppressSeconds: precision === -1,
        suppressMilliseconds: precision === -1 || precision === 0
    })
    if (iso === null) throw new TypeError('Could not serialize Luxon DateTime as RPC datetime')
    if (precision === 1 || precision === 2) {
        return iso.replace(/\.(\d{1,3})(?=Z|[+-]\d{2}:?\d{2}$)/, (_, fraction: string) => `.${fraction.slice(0, precision)}`)
    }
    return iso
}

export function decodeRpcDateTime(value: string): DateTime<true> {
    return toValidDateTime(DateTime.fromISO(value, { setZone: true }))
}

export function encodeRpcDuration(value: Duration): string {
    if (!value.isValid) throw new TypeError('Expected a valid Luxon Duration for RPC duration')
    const iso = value.toISO()
    if (iso === null) throw new TypeError('Could not serialize Luxon Duration as RPC duration')
    return iso
}

export function decodeRpcDuration(value: string): Duration {
    const duration = Duration.fromISO(value)
    if (!duration.isValid) throw new TypeError(`Invalid ISO duration in RPC response: ${duration.invalidReason}`)
    return duration
}

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
    constructor(url: string, statusText: string) {
        super('post', url, 401, statusText)
    }
}

export class Forbidden extends HttpError {
    constructor(url: string, statusText: string) {
        super('post', url, 403, statusText)
    }
}

export class NotFound extends HttpError {
    constructor(url: string, statusText: string) {
        super('post', url, 404, statusText)
    }
}

function url(rpcName: string, callName: string, version: number): string {
    const domain = getFrontConfig().apiDomain

    return `${domain}rpc/${rpcName}_${callName}_v${version}`
}

function admUrl(rpcName: string, callName: string, version: number): string {
    const domain = getFrontConfig().apiDomain

    return `${domain}.adm/rpc/${rpcName}_${callName}_v${version}`
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

export interface AdmAuthParam {
    adminSecret: string
}

export async function rpcCall<BodyT extends object, RespT extends object>(
    rpcName: string,
    callName: string,
    version: number,
    bodyObject: BodyT
): Promise<RespT> {
    const csrfToken = getCsrfToken() ?? undefined
    return request(url(rpcName, callName, version), undefined, bodyObject, csrfToken)
}

export async function admRpcCall<BodyT extends object, RespT extends object>(
    auth: AdmAuthParam,
    rpcName: string,
    callName: string,
    version: number,
    bodyObject: BodyT
): Promise<RespT> {
    return request(admUrl(rpcName, callName, version), `Bearer ${auth.adminSecret}`, bodyObject)
}

async function request<BodyT extends object, RespT extends object>(
    u: string,
    authorization: string | undefined,
    bodyObject: BodyT,
    csrfToken?: string
): Promise<RespT> {
    const headers: Record<string, string> = {}

    const body = await prepareBody(bodyObject)

    if (body !== undefined) {
        headers['content-type'] = 'application/json'
        if (typeof body !== 'string') {
            headers['content-encoding'] = 'gzip'
        }
    }

    if (authorization !== undefined) headers['authorization'] = authorization
    if (csrfToken !== undefined) headers['x-csrf-token'] = csrfToken

    const resp = await fetch(u, {
        method: 'post',
        headers,
        body,
        credentials: 'same-origin'
    })

    if (!resp.ok) {
        if (resp.status === 401) {
            throw new Unauthorized(u, resp.statusText)
        }

        if (resp.status === 403) {
            throw new Forbidden(u, resp.statusText)
        }

        if (resp.status === 404) {
            throw new NotFound(u, resp.statusText)
        }

        throw new HttpError('post', u, resp.status, resp.statusText)
    }

    return await resp.json()
}
