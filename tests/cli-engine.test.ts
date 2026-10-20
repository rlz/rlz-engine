import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import z from 'zod'
import { option, string } from 'cmd-ts'

import { cliCommand, CliEngine, DevCliEngine } from '../src/back/cli/cli-engine.js'
import { RPC_MODULE } from '../src/back/rpc/module.js'
import { admRpc, rpc } from '../src/back/rpc/rpc.js'

describe('development CLI', () => {
    it('writes user and administrative clients from registered endpoint schemas', async () => {
        const workingDirectory = await mkdtemp(join(tmpdir(), 'rlz-engine-dev-cli-'))
        const userOutput = join(workingDirectory, 'generated', 'rpc-client.ts')
        const adminOutput = join(workingDirectory, 'generated', 'admin-rpc-client.ts')
        const module = RPC_MODULE.makeDevCli({
            rpcBuilders: [
                rpc('users').add({
                    name: 'list',
                    v: 1,
                    anonimous: true,
                    bodySchema: z.object({}),
                    respSchema: z.object({ count: z.number() }),
                    action: () => ({ count: 0 })
                })
            ],
            admRpcBuilders: [
                admRpc('audit').add({
                    name: 'logs',
                    v: 1,
                    bodySchema: z.object({ limit: z.number() }),
                    respSchema: z.object({ total: z.number() }),
                    action: () => ({ total: 0 })
                })
            ],
            rpcOutput: userOutput,
            admRpcOutput: adminOutput
        })
        const engine = new DevCliEngine().register(module)
        expect(engine).toBeInstanceOf(DevCliEngine)

        try {
            await module.commands['generate-client'].handler({})
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

        await engine.run(['strategies', 'backup'])
        await engine.run(['strategies', 'backup', '--file', 'custom.sqlite'])

        expect(handler).toHaveBeenNthCalledWith(1, { file: 'default.sqlite' })
        expect(handler).toHaveBeenNthCalledWith(2, { file: 'custom.sqlite' })
    })
})
