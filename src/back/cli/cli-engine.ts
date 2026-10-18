import { command, run as runCommand, subcommands } from 'cmd-ts'

/** One command leaf exposed under a CLI module namespace. */
export interface CliCommand {
    readonly description: string
    readonly args?: Readonly<Record<string, any>>
    readonly handler: (args: Record<string, any>) => void | Promise<void>
}

/** A namespaced group of related commands, such as `http start`. */
export interface CliModule {
    readonly name: string
    readonly description: string
    readonly commands: Readonly<Record<string, CliCommand>>
}

/** Builds and runs an application's operational command tree. */
export class CliEngine {
    private readonly modules = new Map<string, CliModule>()

    constructor(private readonly binaryName = 'app.js') {}

    /** Add a module; duplicate names and invalid command metadata are rejected. */
    register(module: CliModule): this {
        validateName(module.name, 'module')
        validateDescription(module.description, `module ${module.name}`)
        if (this.modules.has(module.name)) {
            throw new Error(`CLI module already registered: ${module.name}`)
        }
        const commands = Object.keys(module.commands)
        if (commands.length === 0) {
            throw new Error(`CLI module has no commands: ${module.name}`)
        }
        for (const [name, commandDefinition] of Object.entries(module.commands)) {
            validateName(name, 'command')
            if (commandDefinition.description.trim() === '') {
                throw new Error(`CLI command ${module.name} ${name} must have a description.`)
            }
        }
        this.modules.set(module.name, module)
        return this
    }

    /** Parse and execute arguments, defaulting to the current process arguments. */
    async run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
        const modules = Object.fromEntries(
            [...this.modules].map(([name, module]) => [
                name,
                subcommands({
                    name,
                    description: module.description,
                    cmds: Object.fromEntries(
                        Object.entries(module.commands).map(([commandName, definition]) => [
                            commandName,
                            command({
                                name: commandName,
                                description: definition.description,
                                args: { ...definition.args },
                                handler: definition.handler
                            })
                        ])
                    )
                })
            ])
        )
        const app = subcommands({
            name: this.binaryName,
            description: 'Application command line interface.',
            cmds: modules
        })
        await runCommand(app, [...argv])
    }
}

/** Development-only commands belong in a separate entry point from the application's operational CLI. */
export class DevCliEngine extends CliEngine {}

function validateName(name: string, kind: string): void {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        throw new Error(`Invalid CLI ${kind} name: ${name}`)
    }
}

function validateDescription(description: string, subject: string): void {
    if (description.trim() === '' || description.includes('\n')) {
        throw new Error(`CLI ${subject} must have a one-line description.`)
    }
}
