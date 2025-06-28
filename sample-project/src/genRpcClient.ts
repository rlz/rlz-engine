import { writeFileSync } from 'fs'
import { generateClient } from 'rlz-engine/back/rpc/gen.js'

import { RPC } from './rpc.js'

writeFileSync('./src/rpcClient.gen.ts', generateClient('rpcClient.gen.ts', RPC), { encoding: 'ascii' })
