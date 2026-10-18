import { resolve } from 'node:path'

import { resetAdminSecret } from './admin-secret.js'
import { CliModule } from '../cli/cli-engine.js'

export const AUTH_MODULE = {
    makeCli(workingDirectory: string | (() => string) = () => process.cwd()): CliModule {
        return {
            name: 'adm',
            description: 'Administrative maintenance commands.',
            commands: {
                'reset-secret': {
                    description:
                        'Generate a keyboard-friendly administrative secret and atomically replace the stored password hash. The plaintext is printed once after the hash is safely written.',
                    handler: async () => {
                        const directory = typeof workingDirectory === 'function' ? workingDirectory() : workingDirectory
                        const secret = await resetAdminSecret(resolve(directory))
                        process.stdout.write(`${secret}\n`)
                    }
                }
            }
        }
    }
}
