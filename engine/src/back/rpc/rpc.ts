import { httpErrors } from '@fastify/sensible'
import { FastifyInstance, FastifyPluginOptions, RawServerBase } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import z from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

interface RpcEndpointCommon<BodyT extends object, RespT extends object> {
    readonly v: number
    readonly name: string
    readonly bodySchema: z.Schema<BodyT>
    readonly respSchema: z.Schema<RespT>
}

interface RpcEndpointAnon<BodyT extends object = object, RespT extends object = object, OptsT = never> extends RpcEndpointCommon<BodyT, RespT> {
    readonly anonimous: true

    readonly action: (
        body: { [k in keyof BodyT]: BodyT[k] },
        opts: OptsT
    ) => { [k in keyof RespT]: RespT[k] }
        | Promise<{ [k in keyof RespT]: RespT[k] }>
}

interface RpcEndpointAuth<BodyT extends object = object, RespT extends object = object, OptsT = never, UserT = never> extends RpcEndpointCommon<BodyT, RespT> {
    readonly anonimous?: false

    readonly auth: (userId: string, password: string) => UserT | Promise<UserT>

    readonly action: (
        user: UserT,
        body: { [k in keyof BodyT]: BodyT[k] },
        opts: OptsT
    ) => { [k in keyof RespT]: RespT[k] }
        | Promise<{ [k in keyof RespT]: RespT[k] }>
}

export type RpcEndpoint<BodyT extends object = object, RespT extends object = object, OptsT = never, UserT = never> = RpcEndpointAnon<BodyT, RespT, OptsT> | RpcEndpointAuth<BodyT, RespT, OptsT, UserT>

export interface RpcEndpointInfo {
    v: number
    name: string
    anonimous: boolean
    bodySchema: z.Schema
    respSchema: z.Schema
}

interface InnerRpcEndpoint<OptsT> extends RpcEndpointInfo {
    reg: <T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) => void
}

function makeReg<BodyT extends object = object, RespT extends object = object, OptsT = never, UserT = never>(pluginName: string, endpoint: RpcEndpoint<BodyT, RespT, OptsT, UserT>): InnerRpcEndpoint<OptsT> {
    return {
        v: endpoint.v,
        name: endpoint.name,
        anonimous: endpoint.anonimous ?? false,
        bodySchema: endpoint.bodySchema,
        respSchema: endpoint.respSchema,

        reg<T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) {
            app.post(
                `/rpc/${pluginName}/${this.name}/v${this.v}`,
                {
                    schema: {
                        body: zodToJsonSchema(this.bodySchema),
                        response: {
                            200: zodToJsonSchema(this.respSchema)
                        }
                    }
                },
                endpoint.anonimous === true
                    ? async (req, resp) => {
                        const body = req.body as BodyT
                        const respBody = await endpoint.action(body, opts)
                        resp.send(respBody)
                    }
                    : async (req, resp) => {
                        const authHeader = req.headers.authorization
                        if (authHeader === undefined) {
                            throw httpErrors.forbidden()
                        }
                        const [userId, password] = authHeader.split(':')
                        const user = await endpoint.auth(userId, password)

                        const body = req.body as BodyT
                        const respBody = await endpoint.action(user, body, opts)
                        resp.send(respBody)
                    }
            )
        }
    }
}

export class RpcPluginBuilder<OptsT extends FastifyPluginOptions = never> {
    readonly name: string
    readonly endpoints: InnerRpcEndpoint<OptsT>[] = []

    constructor(name: string) {
        this.name = name
    }

    add<BodyT extends object, RespT extends object, UserT>(endpoint: RpcEndpoint<BodyT, RespT, OptsT, UserT>) {
        this.endpoints.push(makeReg(this.name, endpoint))
        return this
    }

    makeFastifyPlugin() {
        const endpoints = this.endpoints

        return fastifyPlugin(
            function makeRpcPlugin<T extends RawServerBase>(app: FastifyInstance<T>, opts: OptsT) {
                for (const e of endpoints) {
                    e.reg(app, opts)
                }
            }
        )
    }
}

export function rpc<OptsT extends FastifyPluginOptions>(name: string) {
    return new RpcPluginBuilder<OptsT>(name)
}
