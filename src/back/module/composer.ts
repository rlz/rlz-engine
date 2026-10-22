import type { FastifyInstance, FastifyPluginCallback, FastifyPluginOptions } from 'fastify'

import { CliEngine, type CliModule, DevCliEngine } from '../cli/cli-engine.js'
import { ADM_AUTH_RPC, type AdmRpcPluginBuilder, type RpcPluginBuilder } from '../rpc/rpc.js'
import type { AdmModule } from '../../client/adm/admin.js'

/**
 * Runtime facets returned by feature module factories. Applications create only
 * the facets they need, then pass those values to `composeModules`.
 */
export interface ModuleFacets {
    cli?: readonly CliModule[]
    devCli?: readonly CliModule[]
    rpc?: readonly RpcPluginBuilder[]
    admRpc?: readonly AdmRpcPluginBuilder[]
    adm?: readonly AdmModule[]
    rpcOptions?: Readonly<Record<string, FastifyPluginOptions>>
    admRpcOptions?: Readonly<Record<string, FastifyPluginOptions>>
}

/**
 * Combines selected feature facets into application startup operations.
 * Factory invocation and deployment configuration remain in the application;
 * this object only registers the resulting CLI modules and RPC plugins.
 */
export function composeModules(...facets: readonly ModuleFacets[]) {
    const cliModules = facets.flatMap(({ cli = [] }) => cli)
    const devCliModules = facets.flatMap(({ devCli = [] }) => devCli)
    const rpcBuilders = facets.flatMap(({ rpc = [] }) => rpc)
    const admRpcBuilders = facets.flatMap(({ admRpc = [] }) => admRpc)
    const registeredAdmRpcBuilders = [ADM_AUTH_RPC, ...admRpcBuilders]
    const admModules = facets.flatMap(({ adm = [] }) => adm)
    const rpcOptions = Object.assign({}, ...facets.map(({ rpcOptions = {} }) => rpcOptions))
    const admRpcOptions = Object.assign({}, ...facets.map(({ admRpcOptions = {} }) => admRpcOptions))

    assertUniqueNames(
        cliModules.map(({ name }) => name),
        'CLI module'
    )
    assertUniqueNames(
        devCliModules.map(({ name }) => name),
        'development CLI module'
    )
    assertUniqueNames(
        rpcBuilders.map(({ name }) => name),
        'RPC plugin'
    )
    assertUniqueNames(
        registeredAdmRpcBuilders.map(({ name }) => name),
        'administrative RPC plugin'
    )
    assertUniqueNames(
        admModules.map(({ name }) => name),
        'administration section'
    )

    return {
        /** Administration sections for the application's route at `/.adm`. */
        adm: admModules,
        /** Register the selected operational commands with the application's CLI. */
        registerCli(engine: CliEngine): CliEngine {
            for (const module of cliModules) engine.register(module)
            return engine
        },

        /** Register development-only commands with a separate CLI entry point. */
        registerDevCli(engine: DevCliEngine): DevCliEngine {
            for (const module of devCliModules) engine.register(module)
            return engine
        },

        /** Register user-authenticated and anonymous RPC plugins on a Fastify server. */
        async registerRpc(server: FastifyInstance): Promise<void> {
            for (const builder of rpcBuilders) {
                // RPC builders with no options use `never`; Fastify's register overload expects its default options type.
                await server.register(builder.makeFastifyPlugin() as unknown as FastifyPluginCallback, rpcOptions[builder.name])
            }
        },

        /** Register admin-secret-protected RPC plugins on a Fastify server. */
        async registerAdmRpc(server: FastifyInstance): Promise<void> {
            for (const builder of registeredAdmRpcBuilders) {
                await server.register(builder.makeFastifyPlugin() as unknown as FastifyPluginCallback, admRpcOptions[builder.name])
            }
        }
    }
}

function assertUniqueNames(names: readonly string[], kind: string): void {
    const seen = new Set<string>()
    for (const name of names) {
        if (seen.has(name)) throw new Error(`${kind} already composed: ${name}`)
        seen.add(name)
    }
}
