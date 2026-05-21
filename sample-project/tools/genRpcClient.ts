import { writeFileSync } from 'fs'
import { generateClient } from 'rlz-engine/back/rpc/gen.js'

import { RPC } from '../backend/rpc.js'

writeFileSync('./front/rpcClient.gen.ts', generateClient('rpcClient.gen.ts', RPC), { encoding: 'ascii' })
