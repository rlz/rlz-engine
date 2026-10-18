import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { CliModule } from '../cli/cli-engine.js'
import { generateAdmClient, generateClient } from './gen.js'
import { AdmRpcPluginBuilder, RpcPluginBuilder } from './rpc.js'

export interface RpcClientCliModuleOptions {
    rpcBuilders?: readonly RpcPluginBuilder[]
    admRpcBuilders?: readonly AdmRpcPluginBuilder[]
    rpcOutput?: string
    admRpcOutput?: string
}

export const RPC_MODULE = {
    makeDevCli(options: RpcClientCliModuleOptions): CliModule {
        const rpcBuilders = options.rpcBuilders ?? []
        const admRpcBuilders = options.admRpcBuilders ?? []
        if (rpcBuilders.length === 0 && admRpcBuilders.length === 0) {
            throw new Error('RPC client generation requires at least one user or administrative RPC builder.')
        }

        return {
            name: 'rpc',
            description: 'Development tools for generated RPC clients.',
            commands: {
                'generate-client': {
                    description: 'Generate typed RPC clients from the registered endpoint schemas.',
                    handler: async () => {
                        if (rpcBuilders.length > 0) {
                            if (options.rpcOutput === undefined) {
                                throw new Error('rpcOutput is required when user RPC builders are configured.')
                            }
                            await writeGeneratedFile(options.rpcOutput, generateClient(options.rpcOutput, ...rpcBuilders))
                        }
                        if (admRpcBuilders.length > 0) {
                            if (options.admRpcOutput === undefined) {
                                throw new Error('admRpcOutput is required when administrative RPC builders are configured.')
                            }
                            await writeGeneratedFile(options.admRpcOutput, generateAdmClient(options.admRpcOutput, ...admRpcBuilders))
                        }
                    }
                }
            }
        }
    }
}

async function writeGeneratedFile(filePath: string, contents: string): Promise<void> {
    const absolutePath = resolve(filePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, `${contents}\n`, 'utf8')
}
