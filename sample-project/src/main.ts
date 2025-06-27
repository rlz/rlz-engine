import { runServer } from 'rlz-engine/dist/back/server'

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
    }
})
