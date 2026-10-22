import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { CliModule } from '../cli/cli-engine.js'
import { generateAdmClient, generateClient } from './gen.js'

/** Output paths consumed by `RPC_MODULE.makeDevCli()`; RPC declarations come from the active engine. */
export interface RpcClientCliModuleOptions {
    rpcOutput?: string
    admRpcOutput?: string
}

/** Development integration for generating typed clients from RPC declarations. */
export const RPC_MODULE = {
    /** Create the development-only `rpc generate-client` command. */
    makeDevCli(options: RpcClientCliModuleOptions = {}): CliModule {
        return {
            name: 'rpc',
            description: 'Development tools for generated RPC clients.',
            commands: {
                'generate-client': {
                    description: 'Generate typed RPC clients from the declared endpoint schemas.',
                    handler: async (_args, engine) => {
                        const { rpc, admRpc } = engine
                        if (rpc.length > 0) {
                            if (options.rpcOutput === undefined) {
                                throw new Error('rpcOutput is required when user RPC declarations are configured.')
                            }
                            await writeGeneratedFile(options.rpcOutput, generateClient(options.rpcOutput, ...rpc))
                        }
                        if (admRpc.length > 0) {
                            if (options.admRpcOutput === undefined) {
                                throw new Error('admRpcOutput is required when administrative RPC declarations are configured.')
                            }
                            await writeGeneratedFile(options.admRpcOutput, generateAdmClient(options.admRpcOutput, ...admRpc))
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
