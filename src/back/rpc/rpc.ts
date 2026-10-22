import z from 'zod'

export class RpcError extends Error {
    readonly statusCode: number

    constructor(statusCode: number, message: string) {
        super(message)
        this.name = 'RpcError'
        this.statusCode = statusCode
    }
}

export interface RpcRequestContext {
    request: {
        headers: Readonly<Record<string, string | string[] | undefined>>
        cookies: Readonly<Record<string, string | undefined>>
        protocol: 'http' | 'https'
        ip: string
    }
    reply: {
        setCookie: (name: string, value: string, options: RpcCookieOptions) => void
        clearCookie: (name: string, options: RpcCookieOptions) => void
    }
}

export interface RpcCookieOptions {
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    path?: string
    maxAge?: number
}

interface RpcEndpointCommon<BodyT extends object, RespT extends object> {
    readonly v: number
    readonly name: string
    readonly bodySchema: z.Schema<BodyT>
    readonly respSchema: z.Schema<RespT>
}

interface RpcEndpointAnon<BodyT extends object = object, RespT extends object = object> extends RpcEndpointCommon<BodyT, RespT> {
    readonly anonimous: true
    readonly action: (
        body: { [k in keyof BodyT]: BodyT[k] },
        context: RpcRequestContext
    ) => { [k in keyof RespT]: RespT[k] } | Promise<{ [k in keyof RespT]: RespT[k] }>
}

interface RpcEndpointCookieAuth<BodyT extends object = object, RespT extends object = object, UserT = never> extends RpcEndpointCommon<
    BodyT,
    RespT
> {
    readonly anonimous?: false
    readonly cookieAuth: {
        authenticate: (context: RpcRequestContext) => UserT | Promise<UserT>
        verifyCsrf: (context: RpcRequestContext, user: UserT) => void | Promise<void>
    }
    readonly action: (
        user: UserT,
        body: { [k in keyof BodyT]: BodyT[k] },
        context: RpcRequestContext
    ) => { [k in keyof RespT]: RespT[k] } | Promise<{ [k in keyof RespT]: RespT[k] }>
}

export type RpcEndpoint<BodyT extends object = object, RespT extends object = object, UserT = never> =
    | RpcEndpointAnon<BodyT, RespT>
    | RpcEndpointCookieAuth<BodyT, RespT, UserT>

export interface RpcEndpointInfo {
    v: number
    name: string
    bodySchema: z.Schema
    respSchema: z.Schema
}

export type RegisteredRpcEndpoint = RpcEndpoint<object, object, any>

/** Declares user RPC endpoints without depending on an HTTP server implementation. */
export class Rpc {
    readonly name: string
    readonly endpoints: RegisteredRpcEndpoint[] = []

    constructor(name: string) {
        this.name = name
    }

    add<BodyT extends object, RespT extends object, UserT>(endpoint: RpcEndpoint<BodyT, RespT, UserT>) {
        this.endpoints.push({
            ...endpoint
        } as RegisteredRpcEndpoint)
        return this
    }
}

export function rpc(name: string) {
    return new Rpc(name)
}

export interface AdmRpcEndpoint<BodyT extends object = object, RespT extends object = object> {
    readonly v: number
    readonly name: string
    readonly bodySchema: z.Schema<BodyT>
    readonly respSchema: z.Schema<RespT>
    readonly action: (body: { [k in keyof BodyT]: BodyT[k] }) =>
        | { [k in keyof RespT]: RespT[k] }
        | Promise<{ [k in keyof RespT]: RespT[k] }>
}

export interface AdmRpcEndpointInfo {
    v: number
    name: string
    bodySchema: z.ZodType
    respSchema: z.ZodType
}

/** Declares admin-secret-protected RPC endpoints without depending on an HTTP server implementation. */
export class AdmRpc {
    readonly name: string
    readonly endpoints: AdmRpcEndpoint<object, object>[] = []

    constructor(name: string) {
        this.name = name
    }

    add<BodyT extends object, RespT extends object>(endpoint: AdmRpcEndpoint<BodyT, RespT>) {
        this.endpoints.push(endpoint as AdmRpcEndpoint<object, object>)
        return this
    }
}

export function admRpc(name: string) {
    return new AdmRpc(name)
}

/** Reserved administrative RPC group used by AdminApp to verify an admin secret. */
export const ADM_AUTH_RPC = admRpc('auth').add({
    name: 'verify',
    v: 1,
    bodySchema: z.object({}),
    respSchema: z.object({ ok: z.literal(true) }),
    action: () => ({ ok: true as const })
})
