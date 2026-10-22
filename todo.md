# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- [x] `rlz-engine@1.0.63` accepts heterogeneous administrative RPC builder option types at composition and generation boundaries through `AnyAdmRpcPluginBuilder`, preserving each endpoint's inferred options type.

- [x] `rlz-engine@1.0.61` provides responsive `AdminApp` navigation and module-owned child navigation; `follower` keeps module registrations outside `main.tsx`.
- [x] `AdminApp` verifies the admin secret through the standard `auth.verify` endpoint registered by `rlzEngine()`; administrative modules no longer need duplicate `verify` functions. Included in `1.0.61`.
- [x] Prepared `rlz-engine@1.0.62` with shared in-memory admin auth state (`setAdminSecret`, `getAdminAuth`, `clearAdminSecret`) for application administration modules. The `follower` switch is deferred until the package is published and its dependency is updated.
- [x] `rlz-engine@1.0.62` HTTP servers redact password, token, secret, and authorization fields from serialized request bodies by default; route handlers retain the original values.

- [x] Ensure the HTTP server registers AJV standard formats even when an existing Ajv instance already has format comparison keywords; covered the `date-time` schema regression.

- [x] `rlz-engine@1.0.68` replaces `composeModules()` with async `rlzEngine({...})`, resolving server facets and validating duplicates. `rlzDevEngine(engine, commands)` wraps an initialized engine for a separate dev entry point. Client administration UI modules remain client-side inputs to `AdminApp`.
- [x] Prepared `rlz-engine@1.0.75`: `Rpc` and `AdmRpc` are Fastify-independent endpoint declarations; the HTTP server creates and registers Fastify routes.
- [x] Prepared `rlz-engine@1.0.77`: RPC registration does not reserve `/` or redirect to `/.adm`, leaving root hosting to the application; certificate RPC uses `fastify-acme`'s `certFilename()` helper.
- [x] Prepared `rlz-engine@1.0.78`: development CLI commands receive the resolved `RlzEngine`; RPC client generation reads its `rpc` and `admRpc` lists directly.

- Remove the TypeScript 6 compatibility package and use TypeScript 7 for the Compiler API once TypeScript 7 exposes a suitable API and `zod-to-ts` supports it.
- Implement a reusable project utility (not a `CliModule`) that scaffolds a new application using `rlz-engine` and can refresh its Oxlint and Oxfmt configuration to match the current canonical settings in this repository. Generate the initial `package.json`, TypeScript configuration, Oxlint and Oxfmt configs, Vite setup, `AGENTS.md` with the `spec/` and `todo.md` development workflow, and the minimal project structure and scripts needed to start development with `rlz-engine`. Define how the utility handles existing files and user customizations during config refresh, and make refresh target only the managed lint/format settings so unrelated project configuration is preserved.
