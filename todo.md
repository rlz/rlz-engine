# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- [x] Prepare `rlz-engine@1.1.0` with responsive `AdminApp` navigation and module-owned child navigation. `follower` keeps module registrations outside `main.tsx`; its installed dependency needs the release before it receives the new shell behavior. The package is prepared locally but not published.
- [x] `AdminApp` now verifies the admin secret through the standard `auth.verify` endpoint registered by `composeModules()`; administrative modules no longer need duplicate `verify` functions. Included in the unpublished `1.1.0` package.

- [x] Ensure the HTTP server registers AJV standard formats even when an existing Ajv instance already has format comparison keywords; covered the `date-time` schema regression.

- Add an asynchronous `rlzEngine({...})` application entry point that resolves the configured `cli`, `api`, `admApi`, and `admUi` module facets, accepts promised facets as well as arrays of facets, and returns an engine with `run()`. Support application-level `httpBefore` and `httpAfter` lifecycle hooks, preserving the current startup and shutdown behavior. Map the concise public facet names to the existing CLI, user RPC, administrative RPC, and administration UI composition mechanisms; document ordering, duplicate-name validation, and error propagation in `spec/` when implemented.

- Remove the TypeScript 6 compatibility package and use TypeScript 7 for the Compiler API once TypeScript 7 exposes a suitable API and `zod-to-ts` supports it.
- Implement a reusable project utility (not a `CliModule`) that scaffolds a new application using `rlz-engine` and can refresh its Oxlint and Oxfmt configuration to match the current canonical settings in this repository. Generate the initial `package.json`, TypeScript configuration, Oxlint and Oxfmt configs, Vite setup, `AGENTS.md` with the `spec/` and `todo.md` development workflow, and the minimal project structure and scripts needed to start development with `rlz-engine`. Define how the utility handles existing files and user customizations during config refresh, and make refresh target only the managed lint/format settings so unrelated project configuration is preserved.
