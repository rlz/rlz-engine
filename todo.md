# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- Implement a reusable project utility (not a `CliModule`) that scaffolds a new application using `rlz-engine` and can refresh its ESLint and Prettier configuration to match the current canonical settings in this repository. Generate the initial `package.json`, TypeScript configuration, ESLint and Prettier configs, Vite setup, `AGENTS.md` with the `spec/` and `todo.md` development workflow, and the minimal project structure and scripts needed to start development with `rlz-engine`. Define how the utility handles existing files and user customizations during config refresh, and make refresh target only the managed lint/format settings so unrelated project configuration is preserved.
