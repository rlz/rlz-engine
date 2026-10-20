import { flag } from 'cmd-ts'
import type { FastifyPluginAsync, FastifyPluginCallback } from 'fastify'

import { RunServerParams, runServer } from './server.js'
import { CliModule } from '../cli/cli-engine.js'

export type HttpServerShutdown = () => Promise<void>

export interface HttpModuleOptions {
    /** Fastify plugins registered on each server before application routes. */
    plugins?: readonly (FastifyPluginAsync | FastifyPluginCallback)[]
    /** Runs after resolving server settings and before creating the server. */
    before?: () => void | Promise<void>
    /** Runs after the server is listening. */
    after?: (shutdown: HttpServerShutdown) => void | Promise<void>
}

/** Fastify lifecycle feature; applications provide deployment settings and plugins. */
export const HTTP_MODULE = {
    /** Create the `http start` command using application-owned server configuration. */
    makeCli(
        params: Omit<RunServerParams, 'plugins'> | (() => Omit<RunServerParams, 'plugins'>),
        options: HttpModuleOptions = {}
    ): CliModule {
        return {
            name: 'http',
            description: 'Start the application HTTP server.',
            commands: {
                start: {
                    description:
                        'Start the Fastify server using the deployment settings and plugins supplied by the application. The process remains active until it receives a termination signal.',
                    args: {
                        debug: flag({ long: 'debug', description: 'Enable debug logging.' }),
                        auditSqlite: flag({
                            long: 'audit-sqlite',
                            description: 'Also write audit logs to SQLite when console logging is enabled.'
                        })
                    },
                    handler: async ({ debug, auditSqlite }) => {
                        const serverParams = typeof params === 'function' ? params() : params
                        await options.before?.()
                        const shutdown = await runServer({
                            ...serverParams,
                            debug: debug || serverParams.debug,
                            auditSqlite: auditSqlite || serverParams.auditSqlite,
                            plugins: options.plugins
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
