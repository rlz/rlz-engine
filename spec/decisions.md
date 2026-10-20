# Design decisions

These are decisions evidenced by the current implementation. Add or revise entries when behavior changes; include context and trade-offs so future maintainers can evaluate the choice.

## Focus rlz-engine on low-overhead pet projects

**Decision:** `rlz-engine` is a set of supporting tools for pet projects. It should solve as many recurring tasks as possible in a consistent way while avoiding broad, universal abstractions and keeping administrative work low.

**Reason:** Pet projects benefit more from predictable defaults and less operational overhead than from a framework that can accommodate every deployment shape.

## Use npm for package management

**Decision:** Use npm with the root `package-lock.json` to install and lock dependencies. The repository is a single package and does not need a pnpm workspace configuration.

**Reason:** Using npm avoids requiring a separate package manager while retaining reproducible installs through npm's lockfile. The trade-off is that dependency resolution and installation layout follow npm semantics.

## Use TypeScript 7, Oxlint, and Oxfmt for development tooling

**Decision:** TypeScript 7 provides project compilation and type checking through the `@typescript/native` package alias. The `typescript` package name points to the TypeScript 6 compatibility package because `zod-to-ts` and the RPC client generator use the TypeScript Compiler API, which TypeScript 7 does not yet expose. Oxlint handles lint rules, including type-aware floating-promise checks through `oxlint-tsgolint`; Oxfmt handles formatting. npm scripts expose `lint`, `format`, and `format:check`. ESLint, typescript-eslint, Prettier, and their configuration are not used.

**Reason:** These tools use the TypeScript 7 native compiler and consolidate linting and formatting around the Oxc toolset. The TypeScript 6 compatibility alias preserves existing Compiler API consumers until they support the new API. Type-aware linting retains the prior floating-promise safeguard. The trade-off is that Oxlint's rule set differs from ESLint plugins: the previous simple-import-sort ordering and custom stylistic and naming-convention rules are not part of the new lint configuration.

## Deploy one application per virtual machine

**Decision:** Applications using `rlz-engine` are deployed to network-accessible virtual machines, with one application per VM. The deployment model does not require Docker.

**Reason:** A dedicated VM per application gives a simple deployment and isolation model without adding container management to the project's administrative workload.

## Manage production TLS certificates in rlz-engine

**Decision:** `rlz-engine` takes responsibility for production TLS certificate management for applications exposed on the network.

**Reason:** Centralizing certificate issuance and renewal reduces per-application administrative work. The current server lifecycle already provisions and renews certificates using ACME HTTP-01.

## Plan an in-application administration interface

**Decision:** The project plans to provide an administration interface within the application, including a way to inspect application state and logs.

**Reason:** Operators should be able to check basic application health and diagnostics from the application itself, reducing the need for separate operational tooling. This is planned work, not a currently available feature.

## Replace Pino with structured system and audit loggers

**Decision:** Log calls use structured JavaScript event objects with a required `type` discriminant and event fields. `SystemLogger` provides the Pino-compatible interface needed by Fastify, uses module `SYSTEM`, and forwards records to `AuditLogger` using Fastify's message as the event type. Production SystemLogger output is readable, one line per record, for stdout/journald. Applications can specialize `AuditLogger<EventUnion>` and wrap it with domain methods; `getAuditLogger(module)` provides the underlying module-scoped logger. `initAuditLogger` supports console-only, SQLite-only, and combined SQLite plus console modes. `runServer` defaults to SQLite only in production when debug is disabled, and colored console only in debug/development; `auditSqlite` (or HTTP CLI `--audit-sqlite`) adds SQLite to console output. No sensitive-field redaction is performed, so callers must avoid sending secrets to the logger. Audit records contain time, level, module, event type, structured data, and optional error details including stack trace.

**Reason:** Pino's worker-based transports add operational and build complexity the project wants to avoid. Keeping records structured at the logger boundary supports both readable developer output and durable querying without requiring JSON-formatted console output.

**Implementation status:** `getAuditLogger<EventUnion>` returns a module-scoped typed `AuditLogger`; its level methods accept event objects, with `type` stored as a dedicated field and remaining event properties stored in `data`. Applications can compose one or multiple convenient domain wrappers around the same base logger. `initAuditLogger` selects console, SQLite, or combined SQLite and console output. Before initialization and after shutdown, audit loggers do nothing. `getSystemLogger` creates `SystemLogger` instances that implement Fastify's base logger interface and forward untyped Fastify records to module `SYSTEM`, using their message as `type`. Console audit output is colored by default; production system output is single-line stdout. Production audit records are persisted by the SQLite audit storage described below.

## Store and query audit logs in SQLite

**Decision:** Production audit storage uses Node's built-in SQLite support in `logs.sqlite` in the application working directory. `runServer` accepts a retention age and global maximum record count, defaulting to 30 days and 100,000 records. A periodic cleanup (hourly) removes records older than the retention age and, additionally, the oldest records beyond the configured maximum; cleanup keeps a small margin below the maximum to reduce repeated deletion work. Required indexes are created before server loggers start. Audit storage failures must not stop SystemLogger. An administrative RPC will filter by module, level, and time range, order stably by time and record ID, and cap pages at 1000 records.

**Reason:** A local database provides searchable operational history without adding an external service for the one-process-per-VM deployment model. Age and count limits bound disk usage. Synchronous local writes avoid a worker or queue, with the trade-off that a slow disk can briefly block the event loop; best-effort error isolation keeps storage failures from taking down application work.

**Implementation status:** `src/back/logger/sqlite-storage.ts` reads and writes audit records synchronously through `node:sqlite`, creates time/module/level indexes, prunes on startup and hourly, and closes with the server. `getAuditLogReader()` filters by inclusive time bounds, module, and level, and paginates newest-first with a stable time-and-ID order and a page limit of 1000. When SQLite is not the active sink, it returns an empty page. `LOGGER_MODULE.makeCli()` provides `logger logs` for filtered output from an existing SQLite file opened read-only, using the same colored, multi-line formatter as the live console sink. `AuditLogger` isolates sink errors and reports them to stderr; SystemLogger continues writing production records to stdout. `runServer` selects SQLite-only in non-debug production, console-only in debug/development by default, and combined output when SQLite is enabled alongside console logging.

## Use Bearer tokens for RPC authentication

**Status:** Superseded by cookie-authenticated user RPC. The generic Bearer credential callback described here has been removed; administrative RPC retains its separate admin-secret Bearer contract.

**Decision:** User RPC endpoints and the browser RPC helper use `Authorization: Bearer <userId:password>`. The Bearer scheme wraps the current credential pair so existing endpoint auth callbacks remain compatible; an opaque token contract would require an explicit token validation API. Administrative RPC endpoints are a separate type under `/.adm/rpc/` and accept only `Authorization: Bearer <admin-secret>`, verified against a cryptographic hash stored in `./auth/admin-secret`; if the file is absent, administrative RPC access is unavailable. Production application RPC routes are served over TLS; the unsecure production server is reserved for ACME HTTP-01 and redirects.

**Reason:** Bearer is a standard authorization scheme and can be adopted without changing the current user credential-validation callback. Removing the legacy HTTP API also removes its unprefixed credential header, leaving one user RPC authorization format. The trade-off is that the user Bearer payload still has the existing credential structure; a future opaque-token design needs a separate validation contract. Keeping admin RPC as a distinct endpoint type prevents accidental use of user authentication rules. TLS protects credentials in transit, while storing only a hash avoids keeping the administrative secret in plaintext on disk.

**Implementation status:** The user Bearer callback and credential-pair client transport have been removed. Authenticated user RPC now uses the cookie policy described below. `AUTH_MODULE.makeRpc(storage)` provides anonymous signup/signin and cookie-authenticated session/logout endpoints. Legacy `/api/v0` auth routes, `apiCall()`, and the legacy auth/sync schemas have been removed. Synchronization remains a caller-composed concern: `getAll()` and `syncItems()` provide data and comparison helpers while applications define their typed RPC endpoints for object transfer.

## Provide cookie session primitives without coupling them to auth storage

**Decision:** Fastify cookie parsing is registered by the HTTP server. Session-cookie utilities live alongside auth and always create HttpOnly cookies; there is no utility for creating script-readable cookies. User RPC endpoints are either anonymous or use cookie authentication, and the cookie policy must provide both session authentication and a CSRF verifier. RPC handlers receive request headers/cookies/protocol and reply cookie methods through a narrow context. Browser cookie requests always use same-origin credentials and carry the in-memory synchronizer token. CORS is enabled only in development, without credentials; production serves the frontend and RPC from the same HTTPS origin. The generic user Bearer credential callback has been removed; administrative RPC keeps its independent admin-secret Bearer contract.

**Reason:** Requiring CSRF verification in the cookie-auth endpoint type makes the protection visible at the endpoint boundary. Keeping production same-origin removes deployment-specific credentialed CORS configuration and avoids accidentally trusting a broad origin list. The trade-off is that applications using this server setup must serve their frontend and API from the same HTTPS origin.

Removing the user Bearer callback also removes the `userId:password` credential pair from generated clients and the user RPC transport. Applications that used it must migrate authenticated endpoints to cookie sessions. This keeps one built-in user authentication policy and prevents new application endpoints from putting reusable passwords in authorization headers.

**Implementation status:** `runServer` registers `@fastify/cookie` 11.x directly on the development HTTP and production HTTPS servers. `src/back/auth/cookies.ts` exports session-cookie helpers that always set `HttpOnly`, `Secure`, and `SameSite=Lax`, use `Path=/`, and omit `Domain`; only cookie lifetime is configurable. CSRF utilities in `src/back/auth/csrf.ts` generate 32-byte tokens, compare submitted tokens in constant time, and require exact same-origin requests. `runServer` has no configurable credentialed CORS allowlist; the development CORS policy does not allow credentials, and production does not register CORS.

## Use opaque cookie sessions for built-in authentication

**Decision:** `AUTH_MODULE` issues a fresh random 256-bit session identifier at signin, returns it only in a `Secure`, `HttpOnly`, `SameSite=Lax`, host-only cookie, and persists only its SHA-256 hash. Signup creates an account but does not issue a session; the signup endpoint returns the same empty success response for a new or existing name, and the browser client follows signup with signin. Sessions contain a synchronizer CSRF token and timestamps. `makeRpc(storage, { sessionIdleTimeoutMs })` configures the idle timeout, defaulting to 30 minutes and accepting positive integer milliseconds up to the fixed seven-day absolute timeout. The server deletes a session at logout. Signup, signin, and session restoration require a same-origin `Origin`; state-changing cookie-auth endpoints require both same-origin and a matching CSRF header. Signup passwords must contain 12–1024 characters; signin accepts shorter existing passwords and caps input at 1024 characters. Signup and signin have per-peer in-memory rate limits, and a process-wide concurrency limit bounds simultaneous auth work. The client persists the user profile for display only and keeps the CSRF token in memory. A page reload must restore the profile and CSRF token through the session endpoint before protected calls. Legacy scrypt password hashes remain valid and are upgraded atomically after successful signin; new hashes use version 1 and scrypt parameters `N=32768`, `r=8`, `p=3`.

**Reason:** An opaque server-side session prevents credentials from being replayed as a long-lived browser token and allows logout and expiry to revoke access centrally. A synchronizer token plus same-origin enforcement protects cookie-authenticated RPC requests from CSRF. Generic signup responses reduce account-name disclosure; requiring a follow-up signin avoids issuing a session before the client verifies credentials through the normal login path. Per-process rate and concurrency limits contain simple online guessing and hashing floods; deployments with multiple processes still need an edge or shared rate limit for a deployment-wide quota. Forced relogin is acceptable during migration, but existing passwords should continue working. The trade-off is a sessions collection and a session lookup on authenticated requests; persisted client profile state is not proof of authentication.

**Implementation status:** `AuthStorage` creates and indexes the sessions collection, stores session hashes as MongoDB `Binary` values, and relies on a TTL index for cleanup after expiration. Signup returns an empty response on both successful creation and duplicate name; `SignupSigninScreen` follows it with signin. Signin and signup enforce per-IP attempt windows and share a four-operation per-process concurrency cap. Limits are in-memory and reset on restart. Signup enforces a 12-character minimum and 1024-character maximum; signin retains compatibility with shorter passwords and rejects inputs over 1024 characters. Legacy temporary-password storage is no longer used. `client/state/auth.ts` migrates prior persisted state while dropping the old temporary-password field. Applications using `SignupSigninScreen` restore the session when it mounts; other applications should call the generated `auth.session()` endpoint during startup and before protected calls after a page reload.

## Generate administrative secrets instead of allowing operator-selected values

**Decision:** Planned administration tooling will provide only a command to generate and reset the admin secret, not set an operator-chosen value. It will generate a cryptographically random, keyboard-friendly secret, store only its password-hash representation in `./auth/admin-secret`, and print the plaintext once. Replacing the secret invalidates the previous value. The file will be written with restrictive permissions and atomically replaced.

**Reason:** Generated secrets avoid weak or reused human-selected passwords while remaining practical to type. Printing once keeps the plaintext out of persistent application storage; atomic replacement and restrictive permissions reduce exposure and avoid partially written credentials.

**Implementation status:** `AUTH_MODULE.makeCli()` provides `adm reset-secret`, which generates a 32-character secret from an alphabet that omits visually ambiguous characters. It stores a salted scrypt record at `./auth/admin-secret` using an exclusive temporary file, file sync, and atomic rename; the resulting file has mode `0600`. The plaintext is printed after the replacement succeeds. Applications invoke it through their composed `CliEngine`; the library does not provide a standalone executable. `verifyAdminSecret` loads and validates the record once per process and absolute path, then compares each derived hash in constant time. Missing and malformed files deny verification. The CLI writes the secret from a separate process, so a running server continues using its cached record until restart. `AdmRpcPluginBuilder` uses this verifier and supports an optional working directory for applications that do not use the process current directory.

## Provide an embeddable React administration UI

**Decision:** The reusable React administration UI is mounted by the application at `/.adm`. It prompts for the generated admin secret, authenticates administrative RPC requests with Bearer authorization, and keeps the credential in memory only so a page reload requires re-entry. Administration modules provide a title, default component, and secret-verification request; they may declare additional navigation items and view components. `AdminApp` derives navigation from the registered modules and renders it in a responsive drawer: permanent on desktop and temporary behind a menu button on narrow screens. `composeModules()` collects selected administration modules and rejects duplicate names. The audit-log section is provided by `LOGGER_MODULE`. `CERTIFICATE_MODULE` provides certificate dates and renewal-window status over protected RPC. It reads the public certificate only; the private key is never included in the response. The certificate's `notBefore` validity date is presented as its issue date because the certificate file does not preserve a separate issuance event timestamp. The 30-day renewal threshold follows `fastify-acme`'s current policy.

**Reason:** A shared embeddable UI lets applications expose consistent operational tools without each project building its own administration surface or wiring navigation by hand. A module registration boundary lets application-specific features declare their own navigation while the shell handles selection, layout, and mobile presentation. Keeping credentials in memory limits persistence in the browser, with the trade-off that operators re-enter the secret after reload.

**Implementation status:** `AdminApp` renders one navigation entry per registered module and optional indented child entries from `module.navigation`. It switches the selected module-owned component and closes its temporary drawer after a mobile selection. The top app bar provides a menu button on narrow screens and sign-out on every viewport.

## Bundle reusable capabilities as opt-in module facets

**Decision:** Modules may be authored in an application or provided by `rlz-engine`, using the same opt-in composition style. Each feature lives in its own directory and exports an uppercase `<FEATURE>_MODULE` object from `module.ts`. The object exposes only the integration factories needed by that feature, such as `makeRpc`, `makeAdmRpc`, `makeAdm`, `makeCli`, or `makeDevCli`; applications select and compose those facets. User RPC and administrative RPC are separate concepts in the RPC registration system: user RPC uses the normal user authentication policy and `/rpc/...` routes; `admRpc` uses the administrative Bearer secret and an administrative route under `/.adm`. The `adm` facet contributes UI sections and may rely on `admRpc`; operational and development CLI facets are registered with separate engines. Logging/audit and certificate administration are initial candidates.

**Reason:** Keeping each capability's RPC, user interface, and command-line integration together makes library features easy to adopt while allowing applications to opt into only the parts they use. Independent facets avoid forcing a UI or command dependency on applications that only need an RPC capability.

**Implementation status:** Feature module entry points are `src/back/auth/module.ts` (`AUTH_MODULE.makeCli()`), `src/back/certificate/module.ts` (`CERTIFICATE_MODULE.makeCli()`, `makeAdmRpc()`, and `makeAdm()`), `src/back/http/module.ts` (`HTTP_MODULE.makeCli()`), `src/back/logger/module.ts` (`LOGGER_MODULE.makeCli()`, `makeAdmRpc()`, and `makeAdm()`), and `src/back/rpc/module.ts` (`RPC_MODULE.makeDevCli()`). Each keeps its integration factory with its feature implementation. `composeModules()` combines selected runtime CLI, RPC, and administration artifacts, registers server facets in input order, and rejects duplicate names in each category. It returns collected administration sections for the app to pass to `AdminApp` in its `/.adm` frontend route. Applications still own route startup, bundling, and deployment settings.

## Compose application CLI commands from modules

**Decision:** Applications create a `CliEngine`, register namespaced `CliModule` objects, and call `run()` with the process arguments. A parallel `DevCliEngine` is used by a development-only entry point for commands that should not be registered in the application's operational CLI. A module owns its one-line description, command descriptions, argument parsers, and handlers; the application supplies deployment-specific dependencies through module factories or closures. `cmd-ts`, already a runtime dependency, parses arguments and generates nested help at module and command depth. The operational engine includes `adm reset-secret` and `http start`; the development engine can include client generation. The library exposes these through CLI modules and does not create separate executable entry points for individual commands.

Use `cliCommand()` for commands with parsed arguments. It keeps the `cmd-ts` parser definitions visible to `CliEngine` and infers the handler argument types, so application modules do not need to cast command objects to `CliModule['commands'][string]`.

**Reason:** The library cannot assume an application's domain, ports, static directory, or route registration. Passing these at composition time keeps configuration with the application while allowing library modules to supply reusable operational commands. `cmd-ts` provides typed argument decoding, nested subcommands, and help generated from command metadata without adding a second parser dependency. Namespace collisions, malformed command names, and missing descriptions are rejected during registration.

**Implementation status:** `CliEngine` and `DevCliEngine` share command validation and help generation. `RPC_MODULE.makeDevCli()` writes user and administrative generated clients from supplied endpoint builders to application-selected paths. Applications keep that module in a development CLI entry point; `CliEngine` does not load or register it automatically, so production command setup remains explicit. `AUTH_MODULE.makeCli()` provides admin-secret maintenance, `CERTIFICATE_MODULE.makeCli()` provides `certificates register-acme`, and `HTTP_MODULE.makeCli()` provides `http start`. `HTTP_MODULE.makeCli()` accepts Fastify plugins and optional `before`/`after` lifecycle hooks; `runServer()` owns plugin registration and no app initialization callback is needed. A failing post-listen hook closes the server before its error propagates.

## Improve testability as the library evolves

**Decision:** As `rlz-engine` develops, improve its design and structure to make library behavior easier to test. Use Vitest as the test framework.

**Reason:** Testing should be a practical part of maintaining and extending the library, helping catch regressions while keeping future changes manageable. This records a development direction and tooling choice; it does not claim that a test suite or Vitest setup is already in place.

## Define RPC contracts with Zod

**Decision:** RPC endpoint body and response schemas are Zod schemas, and routes validate both request and response data.

**Reason:** A single runtime schema can validate data at the network boundary and serve as the source for generated TypeScript client types. Endpoint versions in route names allow contracts to evolve explicitly.

## Provide client API generation from backend endpoints

**Decision:** The engine provides a generator that derives typed RPC client methods from backend endpoint registrations and their schemas. A demo consumer was removed from this repository; applications can use the generator in their own build process.

**Reason:** This keeps client method names, versions, and data types derived from the server contract instead of maintaining a parallel handwritten definition.

**Implementation status:** `generateClient()` builds typed methods for `RpcPluginBuilder`; `generateAdmClient()` builds a separate `ADM_RPC_CLIENT` for `AdmRpcPluginBuilder`. Administrative methods require an `AdmAuthParam` and use `admRpcCall()` to send the Bearer secret to `/.adm/rpc/...`. Keeping separate generated surfaces prevents the admin secret from being confused with user credentials.

## Keep shared sync metadata small

**Decision:** Synchronization first exchanges IDs and `lastModified` timestamps, then transfers full objects by ID only when needed.

**Reason:** The client can compare local and remote state without downloading every object on each sync. This requires consistent modification timestamps and leaves conflict/application merge policy to the caller.

## Separate development and production server setup

**Decision:** Development uses one HTTP server; production runs an HTTP challenge/redirect server alongside a secure HTTP/2 server that accepts HTTP/1.

**Reason:** Local development does not need public TLS certificate issuance, while production needs an HTTP-01 endpoint and TLS for application traffic.

## Register AJV formats on every validator instance

**Decision:** The HTTP server's AJV plugin always installs standard formats. It installs comparison keywords only when they are missing, so validators created by `@fastify/response-validation` receive formats such as `date-time` even when their Ajv instance already has `formatMaximum`.

**Reason:** The response-validation plugin creates a separate Ajv instance. Checking only for `formatMaximum` incorrectly treated that keyword as proof that standard formats were present, causing strict schema compilation to fail for date-time response fields.

## Reconcile MongoDB indexes from configuration

**Decision:** `MongoStorage.createIndexes` removes non-system indexes not present in the supplied configuration and creates configured indexes that are missing.

**Reason:** The configured list acts as the desired index state. This keeps deployed collections aligned with application expectations, but makes index configuration changes operationally significant because unlisted indexes are dropped.
