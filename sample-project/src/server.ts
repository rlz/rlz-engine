import { runServer } from 'rlz-engine/back/server.js'

import { RPC } from './rpc.js'

await runServer({
    production: false,
    domain: 'localhost',
    certDir: './cert',
    staticDir: './static',
    init: async (server) => {
        server.get(
            '/hello',
            () => {
                return 'Hello world!'
            }
        )

        server.register(RPC.makeFastifyPlugin())
    }
})
