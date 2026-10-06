import { produce, WritableDraft } from 'immer'
import { Logger, LoggerOptions, pino } from 'pino'

import { PRODUCTION } from './config.js'

export interface LoggerConfig {
    debug?: boolean
}

export function logger(
    name: string,
    config?: LoggerConfig,
    optionsRecipe?: (draft: WritableDraft<LoggerOptions>) => WritableDraft<LoggerOptions>
): Logger {
    const options = optionsRecipe === undefined
        ? loggerOptions(name, config)
        : produce(loggerOptions(name, config), optionsRecipe)
    return pino(options)
}

export function loggerOptions(name: string, { debug = false }: LoggerConfig = {}): LoggerOptions {
    if (PRODUCTION) {
        return {
            name,
            transport: {
                targets: [
                    {
                        level: debug ? 'debug' : 'info',
                        target: 'pino/file',
                        options: { destination: 1 }
                    }
                    // {
                    //     level: 'info',
                    //     target: 'pino-'
                    // }
                ]
            },
            level: debug ? 'debug' : 'info'
        }
    }

    return {
        name,
        transport: {
            targets: [
                {
                    level: 'trace',
                    target: 'pino-pretty'
                }
            ]
        },
        level: debug ? 'trace' : 'info'
    }
}
