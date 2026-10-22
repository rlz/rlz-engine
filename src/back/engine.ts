import { CliEngine, type CliModule } from './cli/cli-engine.js'
import { ADM_AUTH_RPC, AdmRpc, Rpc } from './rpc/rpc.js'

export type FacetInput<T> = T | readonly T[] | Promise<T | readonly T[]>
export interface RlzEngineOptions {
    cli?: FacetInput<CliModule>
    rpc?: FacetInput<Rpc>
    admRpc?: FacetInput<AdmRpc>
    binaryName?: string
}

export interface RlzEngine {
    run(argv?: readonly string[]): Promise<void>
    readonly cli: readonly CliModule[]
    readonly rpc: readonly Rpc[]
    readonly admRpc: readonly AdmRpc[]
}

const cliRunners = new WeakMap<RlzEngine, (modules: readonly CliModule[], argv?: readonly string[]) => Promise<void>>()

/** Resolves application facets once and exposes their runtime integrations. */
export async function rlzEngine(options: RlzEngineOptions = {}) {
    const [cli, rpc, admRpc] = await Promise.all([resolveFacets(options.cli), resolveFacets(options.rpc), resolveFacets(options.admRpc)])
    const registeredAdmRpc = [ADM_AUTH_RPC, ...admRpc]

    assertUniqueNames(
        cli.map(({ name }) => name),
        'CLI module'
    )
    assertUniqueNames(
        rpc.map(({ name }) => name),
        'RPC group'
    )
    assertUniqueNames(
        registeredAdmRpc.map(({ name }) => name),
        'administrative RPC group'
    )
    const runWithCli = async (additionalCli: readonly CliModule[], argv?: readonly string[]) => {
        const engine = new CliEngine(options.binaryName)
        for (const module of [...cli, ...additionalCli]) engine.register(module)
        await engine.run(argv, runtimeEngine)
    }

    const runtimeEngine: RlzEngine = {
        run: (argv?: readonly string[]) => runWithCli([], argv),
        cli,
        rpc,
        admRpc: registeredAdmRpc
    }
    const engine = runtimeEngine
    cliRunners.set(engine, runWithCli)
    return engine
}

/** Internal bridge used by the dev-only wrapper; the production engine exposes no command-extension method. */
export function runRlzEngineWithAdditionalCli(engine: RlzEngine, modules: readonly CliModule[], argv?: readonly string[]): Promise<void> {
    const run = cliRunners.get(engine)
    if (run === undefined) throw new Error('Cannot extend an engine that was not created by rlzEngine().')
    return run(modules, argv)
}

async function resolveFacets<T>(input: FacetInput<T> | undefined): Promise<readonly T[]> {
    if (input === undefined) return []
    const resolved = await input
    return Array.isArray(resolved) ? resolved : [resolved as T]
}

function assertUniqueNames(names: readonly string[], kind: string): void {
    const seen = new Set<string>()
    for (const name of names) {
        if (seen.has(name)) throw new Error(`${kind} already composed: ${name}`)
        seen.add(name)
    }
}
