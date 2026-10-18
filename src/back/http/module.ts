import { flag } from 'cmd-ts'

import { InitServerFuncType, RunServerParams, runServer } from './server.js'
import { CliModule } from '../cli/cli-engine.js'

/** Fastify lifecycle feature; applications provide deployment settings and route setup. */
export const HTTP_MODULE = {
    /** Create the `http start` command using application-owned server configuration. */
    makeCli(params: Omit<RunServerParams, 'init'> | (() => Omit<RunServerParams, 'init'>), init: InitServerFuncType): CliModule {
        return {
            name: 'http',
            description: 'Start the application HTTP server.',
            commands: {
                start: {
                    description:
                        'Start the Fastify server using the deployment settings and route initialization supplied by the application. The process remains active until it receives a termination signal.',
                    args: {
                        debug: flag({ long: 'debug', description: 'Enable debug logging.' }),
                        auditSqlite: flag({
                            long: 'audit-sqlite',
                            description: 'Also write audit logs to SQLite when console logging is enabled.'
                        })
                    },
                    handler: async ({ debug, auditSqlite }) => {
                        const serverParams = typeof params === 'function' ? params() : params
                        await runServer({
                            ...serverParams,
                            debug: debug || serverParams.debug,
                            auditSqlite: auditSqlite || serverParams.auditSqlite,
                            init
                        })
                    }
                }
            }
        }
    }
}
