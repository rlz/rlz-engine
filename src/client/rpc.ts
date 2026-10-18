import { getFrontConfig } from './config.js'

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

export interface AuthParam {
    userId: string
    tempPassword: string
}

export interface BearerAuthParam {
    bearerToken: string
}

export interface AdmAuthParam {
    adminSecret: string
}

export async function rpcCall<BodyT extends object, RespT extends object>(
    auth: AuthParam | BearerAuthParam | null,
    rpcName: string,
    callName: string,
    version: number,
    bodyObject: BodyT
): Promise<RespT> {
    const authorization =
        auth === null ? undefined : 'bearerToken' in auth ? `Bearer ${auth.bearerToken}` : `Bearer ${auth.userId}:${auth.tempPassword}`

    return request(url(rpcName, callName, version), authorization, bodyObject)
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
    bodyObject: BodyT
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

    const resp = await fetch(u, {
        method: 'post',
        headers,
        body
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
