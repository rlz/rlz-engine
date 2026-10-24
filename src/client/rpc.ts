import { DateTime, Duration } from 'luxon'

import { getCsrfToken, getFrontConfig } from './config.js'

export type RpcWireFormat = 'date' | 'datetime' | 'duration'

export interface RpcWireFormatPath {
    path: readonly (string | number)[]
    format: RpcWireFormat
    precision?: number | null
}

export interface RpcWireFormats {
    body?: readonly RpcWireFormatPath[]
    response?: readonly RpcWireFormatPath[]
}

type RpcValueDirection = 'encode' | 'decode'

function convertRpcFormats<T>(value: T, formats: readonly RpcWireFormatPath[] | undefined, direction: RpcValueDirection): T {
    if (formats === undefined) return value
    let result: unknown = value
    for (const format of formats) result = convertAtPath(result, format.path, format, direction)
    return result as T
}

function convertAtPath(value: unknown, path: readonly (string | number)[], spec: RpcWireFormatPath, direction: RpcValueDirection): unknown {
    if (value === null || value === undefined) return value
    if (path.length === 0) return convertRpcValue(value, spec, direction)

    const [segment, ...rest] = path
    if (segment === -1) {
        return Array.isArray(value) ? value.map((item) => convertAtPath(item, rest, spec, direction)) : value
    }
    if (typeof value !== 'object' || Array.isArray(value) || !(segment in value)) return value

    return { ...value, [segment]: convertAtPath((value as Record<string, unknown>)[segment], rest, spec, direction) }
}

function convertRpcValue(value: unknown, spec: RpcWireFormatPath, direction: RpcValueDirection): unknown {
    if (direction === 'encode') {
        if (spec.format === 'date' || spec.format === 'datetime') {
            if (!(value instanceof DateTime) || !value.isValid)
                throw new TypeError(`Expected a valid Luxon DateTime for RPC ${spec.format}`)
            const utcValue = value.toUTC()
            if (spec.format === 'datetime' && spec.precision === -1 && (utcValue.second !== 0 || utcValue.millisecond !== 0)) {
                throw new TypeError('RPC datetime precision is minutes, but the Luxon DateTime contains seconds')
            }
            if (spec.format === 'datetime' && spec.precision === 0 && utcValue.millisecond !== 0) {
                throw new TypeError('RPC datetime precision is seconds, but the Luxon DateTime contains milliseconds')
            }
            if (spec.format === 'datetime' && (spec.precision === 1 || spec.precision === 2)) {
                const divisor = spec.precision === 1 ? 100 : 10
                if (utcValue.millisecond % divisor !== 0) {
                    throw new TypeError(
                        `RPC datetime precision is ${spec.precision} fractional digits, but the Luxon DateTime has finer precision`
                    )
                }
            }
            const iso =
                spec.format === 'date'
                    ? value.toISODate()
                    : utcValue.toISO({
                          suppressSeconds: spec.precision === -1,
                          suppressMilliseconds: spec.precision === -1 || spec.precision === 0
                      })
            if (iso === null) throw new TypeError(`Could not serialize Luxon DateTime as RPC ${spec.format}`)
            if (spec.format === 'datetime' && (spec.precision === 1 || spec.precision === 2)) {
                const precision = spec.precision
                return iso.replace(/\.(\d{1,3})(?=Z|[+-]\d{2}:?\d{2}$)/, (_, fraction: string) => `.${fraction.slice(0, precision)}`)
            }
            return iso
        }
        if (!(value instanceof Duration) || !value.isValid) throw new TypeError('Expected a valid Luxon Duration for RPC duration')
        const iso = value.toISO()
        if (iso === null) throw new TypeError('Could not serialize Luxon Duration as RPC duration')
        return iso
    }

    if (typeof value !== 'string') throw new TypeError(`Expected an ISO string in RPC ${spec.format} response`)
    if (spec.format === 'date') {
        const dateTime = DateTime.fromISO(value, { zone: 'utc' })
        if (!dateTime.isValid) throw new TypeError(`Invalid ISO date in RPC response: ${dateTime.invalidReason}`)
        return dateTime
    }
    if (spec.format === 'datetime') {
        const dateTime = DateTime.fromISO(value, { setZone: true })
        if (!dateTime.isValid) throw new TypeError(`Invalid ISO datetime in RPC response: ${dateTime.invalidReason}`)
        return dateTime
    }
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
    bodyObject: BodyT,
    formats?: RpcWireFormats
): Promise<RespT> {
    const csrfToken = getCsrfToken() ?? undefined
    const response = await request(
        url(rpcName, callName, version),
        undefined,
        convertRpcFormats(bodyObject, formats?.body, 'encode') as object,
        csrfToken
    )
    return convertRpcFormats(response, formats?.response, 'decode') as RespT
}

export async function admRpcCall<BodyT extends object, RespT extends object>(
    auth: AdmAuthParam,
    rpcName: string,
    callName: string,
    version: number,
    bodyObject: BodyT,
    formats?: RpcWireFormats
): Promise<RespT> {
    const response = await request(
        admUrl(rpcName, callName, version),
        `Bearer ${auth.adminSecret}`,
        convertRpcFormats(bodyObject, formats?.body, 'encode') as object
    )
    return convertRpcFormats(response, formats?.response, 'decode') as RespT
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
