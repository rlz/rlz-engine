import { produce, WritableDraft } from 'immer'
import { Logger, LoggerOptions, pino } from 'pino'

import { PRODUCTION } from './config.js'

export function logger(name: string, optionsRecipe?: (draft: WritableDraft<LoggerOptions>) => WritableDraft<LoggerOptions>): Logger {
    const options = optionsRecipe === undefined
        ? loggerOptions(name)
        : produce(loggerOptions(name), optionsRecipe)
    return pino(options)
}

export function loggerOptions(name: string): LoggerOptions {
    if (PRODUCTION) {
        return {
            name,
            transport: {
                targets: [
                    {
                        level: 'info',
                        target: 'pino/file',
                        options: { destination: 1 }
                    }
                    // {
                    //     level: 'info',
                    //     target: 'pino-'
                    // }
                ]
            },
            level: 'info'
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
        level: 'trace'
    }
}
