import { httpErrors } from '@fastify/sensible'
import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest, RawServerBase } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import z from 'zod'

import { verifyAdminSecret } from '../auth/admin-secret.js'

interface RpcEndpointCommon<BodyT extends object, RespT extends object> {
    readonly v: number
    readonly name: string
    readonly bodySchema: z.Schema<BodyT>
    readonly respSchema: z.Schema<RespT>
}

export interface RpcRequestContext {
    request: Pick<FastifyRequest, 'headers' | 'cookies' | 'protocol' | 'ip'>
    reply: {
        setCookie: (...args: Parameters<FastifyReply['setCookie']>) => void
        clearCookie: (...args: Parameters<FastifyReply['clearCookie']>) => void
    }
}

interface RpcEndpointAnon<BodyT extends object = object, RespT extends object = object, OptsT = never> extends RpcEndpointCommon<
    BodyT,
    RespT
> {
    readonly anonimous: true

    readonly action: (
        body: { [k in keyof BodyT]: BodyT[k] },
        opts: OptsT,
        context: RpcRequestContext
    ) => { [k in keyof RespT]: RespT[k] } | Promise<{ [k in keyof RespT]: RespT[k] }>
}

interface RpcEndpointCookieAuth<
    BodyT extends object = object,
    RespT extends object = object,
    OptsT = never,
    UserT = never
> extends RpcEndpointCommon<BodyT, RespT> {
    readonly anonimous?: false

    /** Cookie authentication must include a CSRF verifier; it runs after session lookup and before the action. */
    readonly cookieAuth: {
        authenticate: (context: RpcRequestContext, opts: OptsT) => UserT | Promise<UserT>
        verifyCsrf: (context: RpcRequestContext, user: UserT, opts: OptsT) => void | Promise<void>
    }

    readonly action: (
        user: UserT,
        body: { [k in keyof BodyT]: BodyT[k] },
        opts: OptsT,
        context: RpcRequestContext
    ) => { [k in keyof RespT]: RespT[k] } | Promise<{ [k in keyof RespT]: RespT[k] }>
}

export type RpcEndpoint<BodyT extends object = object, RespT extends object = object, OptsT = never, UserT = never> =
    | RpcEndpointAnon<BodyT, RespT, OptsT>
    | RpcEndpointCookieAuth<BodyT, RespT, OptsT, UserT>

export interface RpcEndpointInfo {
    v: number
    name: string
    anonimous: boolean
    cookieAuth: boolean
    bodySchema: z.Schema
    respSchema: z.Schema
}

interface InnerRpcEndpoint<OptsT> extends RpcEndpointInfo {
    reg: <T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) => void
}

function makeReg<BodyT extends object = object, RespT extends object = object, OptsT = never, UserT = never>(
    pluginName: string,
    endpoint: RpcEndpoint<BodyT, RespT, OptsT, UserT>
): InnerRpcEndpoint<OptsT> {
    return {
        v: endpoint.v,
        name: endpoint.name,
        anonimous: endpoint.anonimous ?? false,
        cookieAuth: 'cookieAuth' in endpoint,
        bodySchema: endpoint.bodySchema,
        respSchema: endpoint.respSchema,

        reg<T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) {
            app.post(
                `/rpc/${pluginName}_${this.name}_v${this.v}`,
                {
                    schema: {
                        body: this.bodySchema.toJSONSchema({
                            target: 'draft-07'
                        }),
                        response: {
                            200: this.respSchema.toJSONSchema({
                                target: 'draft-07'
                            })
                        }
                    }
                },
                async (req, resp) => {
                    const context: RpcRequestContext = {
                        request: req,
                        reply: {
                            setCookie: (...args) => {
                                resp.setCookie(...args)
                            },
                            clearCookie: (...args) => {
                                resp.clearCookie(...args)
                            }
                        }
                    }
                    const body = req.body as BodyT

                    if (endpoint.anonimous === true) {
                        const respBody = await endpoint.action(body, opts, context)
                        await resp.send(respBody)
                        return
                    }

                    const user = await endpoint.cookieAuth.authenticate(context, opts)
                    await endpoint.cookieAuth.verifyCsrf(context, user, opts)
                    const respBody = await endpoint.action(user, body, opts, context)
                    await resp.send(respBody)
                }
            )
        }
    }
}

/** Collects user RPC endpoints and creates the Fastify plugin that serves them. */
export class RpcPluginBuilder<OptsT extends FastifyPluginOptions = never> {
    readonly name: string
    readonly endpoints: InnerRpcEndpoint<OptsT>[] = []

    constructor(name: string) {
        this.name = name
    }

    /** Add an endpoint; its name and version form part of the public route. */
    add<BodyT extends object, RespT extends object, UserT>(endpoint: RpcEndpoint<BodyT, RespT, OptsT, UserT>) {
        this.endpoints.push(makeReg(this.name, endpoint))
        return this
    }

    /** Create a Fastify plugin that registers every endpoint currently in this builder. */
    makeFastifyPlugin() {
        const endpoints = this.endpoints

        return fastifyPlugin(function makeRpcPlugin<T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) {
            for (const e of endpoints) {
                e.reg(app, opts)
            }
        })
    }
}

export function rpc<OptsT extends FastifyPluginOptions>(name: string) {
    return new RpcPluginBuilder<OptsT>(name)
}

export interface AdmRpcPluginOptions extends FastifyPluginOptions {
    workingDirectory?: string
}

export interface AdmRpcEndpoint<BodyT extends object = object, RespT extends object = object, OptsT = never> {
    readonly v: number
    readonly name: string
    readonly bodySchema: z.Schema<BodyT>
    readonly respSchema: z.Schema<RespT>
    readonly action: (
        body: { [k in keyof BodyT]: BodyT[k] },
        opts: OptsT
    ) => { [k in keyof RespT]: RespT[k] } | Promise<{ [k in keyof RespT]: RespT[k] }>
}

export interface AdmRpcEndpointInfo {
    v: number
    name: string
    bodySchema: z.ZodType
    respSchema: z.ZodType
}

/** Collects admin-secret-protected RPC endpoints, separate from user RPC. */
export class AdmRpcPluginBuilder<OptsT extends AdmRpcPluginOptions = AdmRpcPluginOptions> {
    readonly name: string
    readonly endpoints: AdmRpcEndpoint<object, object, OptsT>[] = []

    constructor(name: string) {
        this.name = name
    }

    /** Add an endpoint served under `/.adm/rpc/`. */
    add<BodyT extends object, RespT extends object>(endpoint: AdmRpcEndpoint<BodyT, RespT, OptsT>) {
        this.endpoints.push(endpoint as AdmRpcEndpoint<object, object, OptsT>)
        return this
    }

    makeFastifyPlugin() {
        const endpoints = this.endpoints
        const pluginName = this.name

        return fastifyPlugin(function makeAdmRpcPlugin<T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) {
            for (const endpoint of endpoints) {
                app.post(
                    `/.adm/rpc/${pluginName}_${endpoint.name}_v${endpoint.v}`,
                    {
                        schema: {
                            body: endpoint.bodySchema.toJSONSchema({
                                target: 'draft-07'
                            }),
                            response: {
                                200: endpoint.respSchema.toJSONSchema({
                                    target: 'draft-07'
                                })
                            }
                        }
                    },
                    async (req, resp) => {
                        const authHeader = req.headers.authorization
                        const match = authHeader === undefined ? null : /^Bearer\s+(.+)$/i.exec(authHeader)
                        if (match === null || !(await verifyAdminSecret(match[1], opts.workingDirectory))) {
                            throw httpErrors.forbidden()
                        }

                        const response = await endpoint.action(req.body as object, opts)
                        await resp.send(response)
                    }
                )
            }
        })
    }
}

export function admRpc<OptsT extends AdmRpcPluginOptions = AdmRpcPluginOptions>(name: string) {
    return new AdmRpcPluginBuilder<OptsT>(name)
}
