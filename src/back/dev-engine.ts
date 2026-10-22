import { runRlzEngineWithAdditionalCli, type FacetInput, type RlzEngine } from './engine.js'
import type { CliModule } from './cli/cli-engine.js'

/** Wrap an initialized application engine with commands kept in a development-only entry point. */
export async function rlzDevEngine(engine: RlzEngine, commands: FacetInput<CliModule>): Promise<RlzEngine> {
    const resolved = await commands
    const additionalCli = Array.isArray(resolved) ? resolved : [resolved as CliModule]

    return {
        run: (argv?: readonly string[]) => runRlzEngineWithAdditionalCli(engine, additionalCli, argv),
        cli: engine.cli,
        rpc: engine.rpc,
        admRpc: engine.admRpc
    }
}
