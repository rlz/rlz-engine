import { registerAcmeAccountCli } from 'fastify-acme'

import type { CliModule } from '../cli/cli-engine.js'

/** Create the ACME account registration command. */
export function makeCertificateCli(): CliModule {
    return {
        name: 'certificates',
        description: 'Manage server certificate setup.',
        commands: {
            'register-acme': {
                description: 'Register the ACME account used for TLS certificates.',
                handler: async () => {
                    await registerAcmeAccountCli()
                }
            }
        }
    }
}
