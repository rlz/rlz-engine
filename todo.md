# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- Revisit the Zod JSON Schema `allOf` override in `src/back/rpc/rpc.ts` when the linked Zod issue is resolved; remove the workaround if the generated schemas no longer need it.
- Expose certificate issue/expiration and renewal status through an administrative RPC contract so the certificate module can show when it was issued, when it expires, time until planned renewal, and whether renewal is overdue.
- Implement a reusable project utility (not a `CliModule`) that scaffolds a new application using `rlz-engine` and can refresh its ESLint and Prettier configuration to match the current canonical settings in this repository. Generate the initial `package.json`, TypeScript configuration, ESLint and Prettier configs, Vite setup, `AGENTS.md` with the `spec/` and `todo.md` development workflow, and the minimal project structure and scripts needed to start development with `rlz-engine`. Define how the utility handles existing files and user customizations during config refresh, and make refresh target only the managed lint/format settings so unrelated project configuration is preserved.
