import { resolve } from 'node:path'

import { resetAdminSecret } from './admin-secret.js'
import { CliModule } from '../cli/cli-engine.js'

/** Administrative maintenance feature; applications opt into its CLI facet. */
export const AUTH_MODULE = {
    /** Create the `adm reset-secret` command for the supplied application directory. */
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
