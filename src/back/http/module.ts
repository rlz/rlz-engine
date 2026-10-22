import { flag } from 'cmd-ts'
import { RunServerParams, runServer } from './server.js'
import { CliModule } from '../cli/cli-engine.js'

export type HttpServerShutdown = () => Promise<void>

export interface HttpModuleOptions {
    /** Runs after resolving server settings and before creating the server. */
    before?: () => void | Promise<void>
    /** Runs after the server is listening. */
    after?: (shutdown: HttpServerShutdown) => void | Promise<void>
}

/** HTTP server command; applications provide deployment settings. */
export const HTTP_MODULE = {
    /** Create the `http start` command using application-owned server configuration. */
    makeCli(
        params: Omit<RunServerParams, 'rpc' | 'admRpc'> | (() => Omit<RunServerParams, 'rpc' | 'admRpc'>),
        options: HttpModuleOptions = {}
    ): CliModule {
        return {
            name: 'http',
            description: 'Start the application HTTP server.',
            commands: {
                start: {
                    description: 'Start the Fastify server using the deployment settings supplied by the application.',
                    args: {
                        debug: flag({ long: 'debug', description: 'Enable debug logging.' }),
                        auditSqlite: flag({
                            long: 'audit-sqlite',
                            description: 'Also write audit logs to SQLite when console logging is enabled.'
                        })
                    },
                    handler: async ({ debug, auditSqlite }, engine) => {
                        const serverParams = typeof params === 'function' ? params() : params
                        await options.before?.()
                        const shutdown = await runServer({
                            ...serverParams,
                            debug: debug || serverParams.debug,
                            auditSqlite: auditSqlite || serverParams.auditSqlite,
                            rpc: engine.rpc,
                            admRpc: engine.admRpc
                        })
                        try {
                            await options.after?.(shutdown)
                        } catch (error) {
                            await shutdown()
                            throw error
                        }
                    }
                }
            }
        }
    }
}
