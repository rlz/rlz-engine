import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { DevCliEngine } from '../src/back/cli/cli-engine.js'
import { generateAdmAuthClient } from '../src/back/rpc/gen.js'

const engine = new DevCliEngine('rlz-engine-dev.js')
engine.register({
    name: 'rpc',
    description: 'Generate the built-in administration RPC client.',
    commands: {
        'generate-client': {
            description: 'Generate the built-in administration RPC client.',
            handler: async () => {
                const output = './src/client/adm/rpc-client.gen.ts'
                const absolutePath = resolve(output)
                await mkdir(dirname(absolutePath), { recursive: true })
                await writeFile(absolutePath, `${generateAdmAuthClient(output)}\n`, 'utf8')
            }
        }
    }
})

await engine.run(['rpc', 'generate-client'])
