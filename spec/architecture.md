# Architecture

This note describes the current structure of the `rlz-engine` package. Its package manifest and TypeScript sources live at the repository root; the former `sample-project` demo has been removed.

## Package layout

- `src/back` contains Fastify server setup, RPC registration, authentication, and MongoDB storage helpers.
- `src/client` contains browser-side RPC transport, generated API usage, synchronization logic, and client state.
- `src/shared` contains schemas and types used across the client/server boundary, plus shared utilities.

The package exports compiled `back`, `client`, and `shared` modules from `dist` according to the root `package.json`.

The package requires Node.js 22.13 or newer for the built-in `node:sqlite` API used by production audit storage.

## RPC contract and code generation

User RPC endpoints are declared with `RpcPluginBuilder`, while administrative endpoints use the separate `AdmRpcPluginBuilder` in `src/back/rpc/rpc.ts`. Each endpoint carries a name, integer version, Zod body and response schemas, and an action. User routes use `/rpc/<plugin>_<endpoint>_v<version>`; authenticated user endpoints call their auth function before their action. Administrative routes use `/.adm/rpc/<plugin>_<endpoint>_v<version>` and require `Authorization: Bearer <admin-secret>`, verified against `./auth/admin-secret` by `verifyAdminSecret`. They do not accept the legacy user credential format.

`src/back/rpc/gen.ts` turns registered endpoint schemas into TypeScript body/response types and a client object. Consumers can generate a typed client from backend RPC definitions. Keep endpoint versions, shared schemas, and generated client expectations aligned when changing a contract.

## Authentication and client transport

The browser RPC helper serializes requests as JSON, compresses bodies larger than 16 KiB with gzip, and adds an authorization header for authenticated calls. It supports both the legacy `userId:password` header and `Bearer <userId:password>`; the Bearer scheme wraps the same credentials so existing endpoint auth callbacks continue to validate them. It maps common HTTP statuses to dedicated error classes. The backend RPC registration accepts either header form, parses the user ID and password values, delegates validation to the endpoint's auth callback, then invokes the action.

The auth endpoint implementations and persistence live under `src/back/auth`; browser login state lives in `src/client/state/auth.ts` and is persisted by Zustand.

## Optional library modules

Planned modules may be authored by an application or provided by `rlz-engine`; both use the same module composition style. Modules will bundle related reusable capabilities and expose opt-in facets: user RPC (`rpc`), administrative RPC (`admRpc`), administration UI (`adm`), and CLI (`cli`). A module only contributes selected facets. User RPC uses the standard user authentication path and `/rpc/<plugin>_<endpoint>_v<version>` routes. Administrative RPC is distinct, is available under `/.adm` (including the admin UI's RPC API), and requires the administrative Bearer secret. The RPC system will explicitly represent and register `admRpc` endpoints separately from user RPC so the two authentication policies cannot be confused. The `adm` facet contributes a UI section and can depend on the module's `admRpc` facet. CLI modules register a namespace and named commands with `CliEngine`; command invocation follows `node app.js <module> <command> <args...>`. The application composes selected module facets during server startup and CLI setup. Logging/audit and certificate administration are initial module candidates.

`CliEngine` composes registered modules into nested `cmd-ts` subcommands. Every module and command has a description; commands may define `cmd-ts` positional arguments, options, and flags. Its generated help follows the command tree: `app.js --help` lists modules and one-line descriptions, `app.js <module> --help` lists that module's commands, and `app.js <module> <command> --help` shows the command description and declared arguments. `admCliModule` contributes `reset-secret`; `makeHttpCliModule` contributes `start` and receives the application's `runServer` settings and initialization callback from the application composition layer. This keeps deployment configuration in the application while letting reusable modules own their commands.

User RPC authorization formats are `userId:password` and `Bearer <userId:password>`. The Bearer form preserves the existing credential payload and is available to user RPC endpoints and the browser RPC helper; the legacy form remains supported for migration. Administrative RPC uses a separate Bearer secret contract. The production application RPC server is the TLS server; the separate unsecure server handles ACME HTTP-01 and redirects.

The `adm reset-secret` command is provided by `admCliModule` and runs through an application's `CliEngine`; the library does not expose a separate executable for it. It writes a salted scrypt record to `./auth/admin-secret` relative to the current working directory, then prints the newly generated secret once. The file is atomically replaced with mode `0600`; each invocation resets the previous secret. `verifyAdminSecret` caches the parsed record in memory by absolute path, so the file is read once per process and path. Missing or malformed records deny access. Because secret generation runs in a separate CLI process, a running HTTP server keeps its cached record until it restarts. Administrative RPC routes do not yet use the verifier. The React administration UI will be provided as a reusable module and mounted by applications at `/.adm`. It will ask for the admin secret and use it as a Bearer credential for protected administrative RPC calls; the UI should keep the credential only in memory and require re-entry after reload. Applications will be able to register administration modules that contribute UI sections and their RPC-backed data. Planned modules include audit-log browsing and certificate status (issue time, expiration time, time until planned renewal, and whether renewal is overdue).

## Logging and audit trail

Logger implementations live in `src/back/logger/`, with imports targeting their implementation modules directly. Application modules call `getAuditLogger<EventUnion>(module)` to get a module-scoped `AuditLogger` with level methods and strongly typed event objects. Each event has a `type` discriminant; its other fields are stored in `data`. Applications can compose domain-specific logger wrappers with methods such as `userRegistered`, sharing the typed `AuditLogger` beneath them. `initAuditLogger` selects one of three modes: console, SQLite, or SQLite plus console. Logger instances obtained before initialization remain no-op until a sink is selected, and return to no-op after the sink is closed. `runServer` defaults to SQLite only in production when debug is disabled, and colored console only otherwise. In console mode, `RunServerParams.auditSqlite` or the HTTP CLI `--audit-sqlite` flag enables SQLite alongside the console. `getSystemLogger(name)` creates a Fastify-compatible `SystemLogger`, which forwards records to module `SYSTEM`, uses the Fastify message as the event type, and retains its logger name in structured data; it prints readable single-line records to stdout in production.

Audit records contain time, level, module, event `type`, structured `data`, and optional error details including stack trace. Structured fields are serialized for storage without secret-field redaction; callers are responsible for not logging secrets. Production `runServer` writes to `logs.sqlite` in the application working directory. Retention defaults to 30 days and the global record limit defaults to 100,000; both can be overridden in `RunServerParams`. `SqliteAuditStorage` creates indexes by time, module, and level, prunes expired/excess records on startup and hourly, and closes with the server. `getAuditLogReader()` returns an `AuditLogReader` that can filter by inclusive time bounds, module, and level, and paginate newest-first with a stable time-and-ID order and a page limit of 1000; it returns an empty page when SQLite is not the active sink. Its `DatabaseSync` reads and writes are synchronous; storage errors are reported to stderr without interrupting application or SystemLogger output. An administrative RPC may expose the same query capability.

## Data synchronization

The shared synchronization schemas define the wire format for listing comparison metadata, fetching objects by ID, and pushing objects. Server storage helpers list an owner's object IDs and `lastModified` values, optionally filtered by a sync timestamp. The client compares those timestamps with local items: newer local items are pushed, while newer or previously unknown remote items are fetched and passed to the local update callback.

The sync helpers coordinate metadata and transfer; application-specific merging and durable client storage are supplied by their callers.

## Storage and server lifecycle

`MongoStorage` wraps MongoDB access and reconciles configured collection indexes by removing obsolete named indexes and creating missing ones. Storage model helpers use string UUIDs and carry owner and synchronization metadata.

`runServer` configures Fastify. Development serves on the unsecure port with CORS and static routes. Production starts the HTTP server for ACME HTTP-01 and redirects, obtains the certificate, then starts an HTTP/2-capable TLS server with HTTP/1 fallback and periodic certificate renewal. Both servers are closed by the returned shutdown function.
