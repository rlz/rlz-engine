import { createRequire } from 'node:module'
import path from 'node:path'

import type { BuildOptions, Plugin } from 'esbuild'
import { build as esbuildBuild } from 'esbuild'

const REQUIRE = createRequire(import.meta.url)

type PinoWorkersPluginOptions = {
    transports?: string[]
}

type ExtraEntry = {
    entryPoint: string
    outfile: string
    overrideKey: string
}

export function esbuildPluginPino(options: PinoWorkersPluginOptions = {}): Plugin {
    return {
        name: 'pino-workers',
        setup(build) {
            const outdir = build.initialOptions.outdir

            if (!outdir) {
                throw new Error('pinoWorkersPlugin requires "outdir" to be set')
            }

            const extraEntries = resolveExtraEntries(outdir, options.transports ?? [])
            injectBundlerOverrides(build.initialOptions, extraEntries)

            build.onEnd(async (result) => {
                if (result.errors.length > 0) {
                    return
                }

                await Promise.all(extraEntries.map(entry => esbuildBuild(makeBuildOptions(build.initialOptions, entry))))
            })
        }
    }
}

function resolveExtraEntries(outdir: string, transports: string[]): ExtraEntry[] {
    const transportEntries = Array.from(new Set(['pino/file', ...transports])).map(transport => ({
        entryPoint: REQUIRE.resolve(transport),
        outfile: path.join(outdir, `${sanitizeTransportName(transport)}.js`),
        overrideKey: transport
    }))

    return [
        {
            entryPoint: REQUIRE.resolve('thread-stream/lib/worker.js'),
            outfile: path.join(outdir, 'thread-stream-worker.js'),
            overrideKey: 'thread-stream-worker'
        },
        {
            entryPoint: REQUIRE.resolve('pino/lib/worker.js'),
            outfile: path.join(outdir, 'pino-worker.js'),
            overrideKey: 'pino-worker'
        },
        ...transportEntries
    ]
}

function makeBuildOptions(initialOptions: BuildOptions, entry: ExtraEntry): BuildOptions {
    return {
        bundle: true,
        define: initialOptions.define,
        external: initialOptions.external,
        format: initialOptions.format ?? 'cjs',
        keepNames: initialOptions.keepNames,
        minify: initialOptions.minify,
        outfile: entry.outfile,
        platform: initialOptions.platform ?? 'node',
        sourcemap: initialOptions.sourcemap,
        target: initialOptions.target,
        entryPoints: [entry.entryPoint]
    }
}

function sanitizeTransportName(transport: string): string {
    return transport.replace(/[@/\\]/g, '-')
}

function injectBundlerOverrides(initialOptions: BuildOptions, extraEntries: ExtraEntry[]): void {
    const existingBanner = initialOptions.banner?.js
    const overrideLines = extraEntries.map((entry) => {
        const relativePath = `./${path.basename(entry.outfile)}`
        return `${JSON.stringify(entry.overrideKey)}: pinoBundlerAbsolutePath(${JSON.stringify(relativePath)})`
    })
    const banner = [
        existingBanner,
        'function pinoBundlerAbsolutePath(path) {',
        '    try {',
        '        return require(\'path\').join((process.cwd() + require(\'path\').sep + \'dist\').replace(/\\\\/g, \'/\'), path)',
        '    } catch {',
        '        return new Function(\'p\', \'return new URL(p, import.meta.url).pathname\')(path)',
        '    }',
        '}',
        'globalThis.__bundlerPathsOverrides = {',
        '    ...(globalThis.__bundlerPathsOverrides || {}),',
        `    ${overrideLines.join(',\n    ')}`,
        '};'
    ].filter(Boolean).join('\n')

    initialOptions.banner = {
        ...initialOptions.banner,
        js: banner
    }
}
