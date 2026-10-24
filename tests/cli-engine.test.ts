import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import z from 'zod'
import { option, string } from 'cmd-ts'

import { cliCommand, CliEngine, DevCliEngine } from '../src/back/cli/cli-engine.js'
import { rlzDevEngine } from '../src/back/dev-engine.js'
import { rlzEngine } from '../src/back/engine.js'
import { RPC_MODULE } from '../src/back/rpc/module.js'
import { admRpc, rpc } from '../src/back/rpc/rpc.js'

describe('development CLI', () => {
    it('wraps production CLI modules with additional development commands', async () => {
        const productionCommand = vi.fn()
        const developmentCommand = vi.fn()
        const engine = await rlzEngine({
            cli: {
                name: 'app',
                description: 'Application commands.',
                commands: { status: { description: 'Show status.', handler: productionCommand } }
            }
        })
        const developmentEngine = await rlzDevEngine(engine, {
            name: 'rpc',
            description: 'RPC tools.',
            commands: { generate: { description: 'Generate clients.', handler: developmentCommand } }
        })

        await developmentEngine.run(['rpc', 'generate'])

        expect(developmentCommand).toHaveBeenCalledOnce()
        expect(productionCommand).not.toHaveBeenCalled()
    })

    it('writes user and administrative clients from registered endpoint schemas', async () => {
        const workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-dev-cli-'))
        const userOutput = join(workingDirectory, 'generated', 'rpc-client.gen.ts')
        const adminOutput = join(workingDirectory, 'generated', 'admin-rpc-client.gen.ts')
        const module = RPC_MODULE.makeDevCli({
            rpcOutput: userOutput,
            admRpcOutput: adminOutput
        })
        const engine = new DevCliEngine().register(module)
        expect(engine).toBeInstanceOf(DevCliEngine)

        try {
            const runtimeEngine = await rlzEngine({
                rpc: [
                    rpc('users').add({
                        name: 'list',
                        v: 1,
                        anonimous: true,
                        bodySchema: z.object({}),
                        respSchema: z.object({ count: z.number() }),
                        action: () => ({ count: 0 })
                    })
                ],
                admRpc: [
                    admRpc('audit').add({
                        name: 'logs',
                        v: 1,
                        bodySchema: z.object({ limit: z.number() }),
                        respSchema: z.object({ total: z.number() }),
                        action: () => ({ total: 0 })
                    })
                ]
            })
            await module.commands['generate-client'].handler({}, runtimeEngine)
            const userClient = await readFile(userOutput, 'utf8')
            const adminClient = await readFile(adminOutput, 'utf8')
            expect(userClient).toContain('RPC_CLIENT')
            expect(userClient).toContain('RpcBodyUsersListV1')
            expect(adminClient).toContain('ADM_RPC_CLIENT')
            expect(adminClient).toContain('admRpcCall')
        } finally {
            await rm(workingDirectory, { recursive: true, force: true })
        }
    })
})

describe('operational CLI', () => {
    it('passes parsed arguments from cliCommand to the handler', async () => {
        const handler = vi.fn()
        const runtime = await rlzEngine()
        const engine = new CliEngine('app.js').register({
            name: 'strategies',
            description: 'Manage strategies.',
            commands: {
                backup: cliCommand({
                    description: 'Create a database backup.',
                    args: {
                        file: option({
                            type: string,
                            long: 'file',
                            defaultValue: () => 'default.sqlite',
                            description: 'Backup file path.'
                        })
                    },
                    handler
                })
            }
        })

        await engine.run(['strategies', 'backup'], runtime)
        await engine.run(['strategies', 'backup', '--file', 'custom.sqlite'], runtime)

        expect(handler).toHaveBeenNthCalledWith(1, { file: 'default.sqlite' }, runtime)
        expect(handler).toHaveBeenNthCalledWith(2, { file: 'custom.sqlite' }, runtime)
    })
})
