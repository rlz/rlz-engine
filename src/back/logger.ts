import { Logger, LoggerOptions, pino } from 'pino'

import { PRODUCTION } from './config'

export function logger(name: string): Logger {
    return pino(loggerOptions(name))
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
            }
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
        }
    }
}
