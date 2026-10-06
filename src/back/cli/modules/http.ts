import { flag } from 'cmd-ts'

import { InitServerFuncType, RunServerParams, runServer } from '../../server.js'
import { CliModule } from '../cli-engine.js'

export function makeHttpCliModule(
    params: Omit<RunServerParams, 'init'> | (() => Omit<RunServerParams, 'init'>),
    init: InitServerFuncType
): CliModule {
    return {
        name: 'http',
        description: 'Start the application HTTP server.',
        commands: {
            start: {
                description:
                    'Start the Fastify server using the deployment settings and route initialization supplied by the application. The process remains active until it receives a termination signal.',
                args: {
                    debug: flag({ long: 'debug', description: 'Enable debug logging.' })
                },
                handler: async ({ debug }) => {
                    const serverParams = typeof params === 'function' ? params() : params
                    await runServer({ ...serverParams, debug: debug || serverParams.debug, init })
                }
            }
        }
    }
}
