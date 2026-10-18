# rlz-engine

`rlz-engine` is a TypeScript toolkit for small web applications. It provides Fastify server setup, MongoDB helpers, schema-validated RPC, browser RPC transport, authentication helpers, audit logging, synchronization utilities, and reusable CLI modules.

The package is an opt-in library: applications choose which capabilities to compose. It does not provide an application executable or automatically register its routes and CLI commands.

## Requirements and installation

- Node.js 22.13 or newer
- MongoDB for the MongoDB storage helpers
- React and React DOM when using the React client components

Install the package and its peer dependencies as needed:

```sh
npm install rlz-engine
npm install react react-dom
```

The package exports compiled files through subpaths under `rlz-engine/back/*`, `rlz-engine/client/*`, and `rlz-engine/shared/*`. Import implementation modules directly; for example:

```ts
import { rpc } from 'rlz-engine/back/rpc/rpc.js'
import { HTTP_MODULE } from 'rlz-engine/back/http/module.js'
import { syncItems } from 'rlz-engine/client/sync.js'
```

## Feature modules

Each backend feature module exposes an uppercase object from its `module.js` entry point. Applications call only the facets they need and register the returned objects with their own server or CLI setup.

| Module          | Facets                      | Purpose                                                         |
| --------------- | --------------------------- | --------------------------------------------------------------- |
| `AUTH_MODULE`   | `makeCli()`                 | `adm reset-secret` administrative secret command                |
| `HTTP_MODULE`   | `makeCli(params, init)`     | `http start` server command                                     |
| `LOGGER_MODULE` | `makeCli()`, `makeAdmRpc()` | Audit-log reader command and protected audit query endpoint     |
| `RPC_MODULE`    | `makeDevCli(options)`       | Generate user and administrative RPC clients during development |

The library does not currently include the planned React administration UI or a certificate-status administration module. The administrative RPC transport and audit-log endpoint are available independently.

### CLI composition

`CliEngine` provides operational commands. `DevCliEngine` is a separate entry point for development commands, such as generated-client updates.

```ts
import { CliEngine, DevCliEngine } from 'rlz-engine/back/cli/cli-engine.js'
import { AUTH_MODULE } from 'rlz-engine/back/auth/module.js'
import { HTTP_MODULE } from 'rlz-engine/back/http/module.js'
import { LOGGER_MODULE } from 'rlz-engine/back/logger/module.js'
import { RPC_MODULE } from 'rlz-engine/back/rpc/module.js'

const cli = new CliEngine('app.js')
    .register(AUTH_MODULE.makeCli())
    .register(HTTP_MODULE.makeCli(serverParams, initializeRoutes))
    .register(LOGGER_MODULE.makeCli())

await cli.run()

const devCli = new DevCliEngine('dev.js').register(
    RPC_MODULE.makeDevCli({
        rpcBuilders: userRpcPlugins,
        admRpcBuilders: adminRpcPlugins,
        rpcOutput: './src/client/generated/rpc-client.ts',
        admRpcOutput: './src/client/generated/admin-rpc-client.ts'
    })
)
await devCli.run()
```

Each engine generates nested help from module and command descriptions. For example, `app.js --help`, `app.js http --help`, and `app.js http start --help` show the command tree at progressively narrower levels. Operational and development commands are registered separately so client generation does not need to be included in production command setup.

`AUTH_MODULE.makeCli(workingDirectory?)` accepts a directory or a callback returning one; it defaults to the current working directory. `HTTP_MODULE.makeCli(params, init)` accepts `RunServerParams` without `init`, or a callback that returns those settings, and the route initialization callback. `LOGGER_MODULE.makeCli(workingDirectory?)` accepts the directory containing `logs.sqlite` and defaults to the current working directory. `RPC_MODULE.makeDevCli(options)` requires at least one user or administrative RPC builder and an output path for each configured builder kind.

## HTTP server

The server implementation is in `back/http/server.js`. Its `runServer()` function accepts `RunServerParams`:

```ts
import { runServer } from 'rlz-engine/back/http/server.js'

await runServer({
    production: process.env.NODE_ENV === 'production',
    domain: 'example.com',
    certDir: './certs',
    staticDir: './dist',
    init: async (server) => {
        // Register application routes and plugins here.
    }
})
```

`domain`, `certDir`, `staticDir`, and `init` are required. Optional settings include `debug`, `unsecurePort`, `securePort`, `auditRetentionMs`, `auditMaxRecords`, `auditSqlite`, and `acmeProvider`. Development serves HTTP with CORS and static files. Production runs an HTTP-01 challenge and redirect server alongside a TLS server with HTTP/2 and HTTP/1 support, and renews certificates periodically. The returned shutdown function closes the servers and logging storage. The `http start` CLI command keeps the process active until a termination signal.

By default, non-debug production writes audit logs to `logs.sqlite`. Development and debug mode use colored console output. Set `auditSqlite: true` (or pass `--audit-sqlite` to `http start`) to write SQLite records alongside console output. Retention defaults to 30 days and the maximum record count defaults to 100,000.

## RPC endpoints and generated clients

Define user RPC plugins with `rpc()` and administrative plugins with `admRpc()`. Every endpoint has a version, a name, Zod body and response schemas, and an action. User endpoints may be anonymous or provide an `auth` callback.

```ts
import z from 'zod'
import { rpc, admRpc } from 'rlz-engine/back/rpc/rpc.js'

export const userRpc = rpc('users').add({
    name: 'get-profile',
    v: 1,
    bodySchema: z.object({}),
    respSchema: z.object({ name: z.string() }),
    auth: async (userId, password) => authenticate(userId, password),
    action: async (user) => ({ name: user.name })
})

export const adminRpc = admRpc('operations').add({
    name: 'health',
    v: 1,
    bodySchema: z.object({}),
    respSchema: z.object({ status: z.string() }),
    action: async () => ({ status: 'ok' })
})
```

Register the generated Fastify plugins from the application initialization callback:

```ts
await server.register(userRpc.makeFastifyPlugin())
await server.register(adminRpc.makeFastifyPlugin())
```

User endpoints are served at `/rpc/<plugin>_<endpoint>_v<version>`. Authenticated routes accept `Authorization: Bearer <userId:password>` and temporarily continue to accept the legacy `Authorization: <userId:password>` form. The endpoint's `auth` callback validates credentials and returns the user value passed to `action`.

Administrative endpoints are served at `/.adm/rpc/<plugin>_<endpoint>_v<version>` and accept only `Authorization: Bearer <admin-secret>`. The secret is checked against the salted scrypt hash in `./auth/admin-secret` relative to the process working directory. Use the operational `adm reset-secret` command to create or replace it; the generated plaintext is printed once. The server caches the hash per process and path, so restart a running server after resetting the secret.

`generateClient(fileName, ...rpcBuilders)` and `generateAdmClient(fileName, ...admRpcBuilders)` in `back/rpc/gen.js` generate typed clients from endpoint schemas. The `rpc generate-client` command exposed by `RPC_MODULE.makeDevCli()` invokes these generators and writes outputs to the configured paths. Generated user methods use `rpcCall()`; generated administrative methods require `AdmAuthParam` and use `admRpcCall()`.

### RPC transport

`client/rpc.js` exports `rpcCall()`, `admRpcCall()`, auth parameter types, and `HttpError`, `Unauthorized`, `Forbidden`, and `NotFound` errors. Requests and responses are JSON. Request bodies larger than 16 KiB are gzip-compressed. User auth supports either the current Bearer-wrapped credential pair or the legacy header form; admin auth is a separate secret-only Bearer contract. Configure the API base URL with `initFrontConfig({ apiDomain })` from `client/config.js`; the default is `/` in production and `http://localhost:8080/` otherwise.

## Authentication and legacy HTTP API

`back/auth` contains `AuthStorage`, user signup/signin/logout and credential verification helpers, plus the administrative-secret implementation. `AUTH_API` in `back/auth/controllers.js` registers the existing legacy HTTP authentication routes. These routes and the `client/api` helpers remain available for compatibility; applications can use RPC for new contracts. The shared request and response schemas for the legacy auth and sync APIs are in `shared/api/`.

`client/api/api.js` exports `apiCall()` and HTTP error classes. `client/api/auth.js` provides `apiSignup()`, `apiSignin()`, and `apiLogout()`. Login state is available through `useAuthState` in `client/state/auth.js` and is persisted with Zustand.

## Logging and audit records

`LOGGER_MODULE.makeCli()` supplies `logger logs`, which reads an existing SQLite audit database in read-only mode. Supported filters are `--from`, `--to`, `--module`, `--level`, `--limit`, and `--offset`.

`LOGGER_MODULE.makeAdmRpc()` creates the `audit_logs_v1` administrative endpoint, which can be registered like other administrative RPC plugins. It accepts optional time, module, level, limit, and offset filters. Pages are newest-first, ordered stably, and capped at 1,000 records; defaults are 100 records and offset 0.

Applications can write typed audit events using `getAuditLogger<EventUnion>(module)`:

```ts
import { getAuditLogger, type AuditEvent } from 'rlz-engine/back/logger/audit-logger.js'

type UserEvent = AuditEvent & { type: 'user-registered'; userId: string }
const audit = getAuditLogger<UserEvent>('USERS')
audit.info({ type: 'user-registered', userId: 'user-id' })
```

Each event has a `type` and structured fields. Audit records include time, level, module, type, data, and optional error details. `initAuditLogger()` selects console, SQLite, or combined console and SQLite sinks and returns a shutdown function. Loggers obtained before initialization are no-op until a sink is selected, and become no-op again after shutdown. `getSystemLogger(name)` creates a Fastify-compatible logger that forwards records as `SYSTEM` audit events and writes readable single-line output in production.

Structured fields are persisted as provided; do not include passwords, admin secrets, or other sensitive values in log events. SQLite uses Node's built-in synchronous database API. Storage failures are reported to stderr and do not interrupt SystemLogger output.

## MongoDB and synchronization

`MongoStorage` in `back/storage/db.js` wraps MongoDB collections and reconciles indexes to the configured descriptions: non-system indexes not listed in the configuration are removed, and missing configured indexes are created. `back/storage/model.js` defines `MongoObject<T>` and the shared sync-object schema. `AuthStorage` is separate and stores authentication data.

`back/storage/sync.js` provides `getAll()` for listing an owner's object IDs and modification times. The client-side `syncItems()` helper in `client/sync.js` compares these timestamps with local items, pushes newer local objects, and fetches newer or unknown remote objects. The sync helpers do not define application-specific merging or durable local storage; callers provide item access and update behavior. Shared legacy API schemas for sync requests and responses live in `shared/api/sync.js`.

## React client components and state

- `SignupSigninScreen` provides the existing signup/signin screen; applications supply its `appName` prop.
- `NotFound` is the 404 screen.
- `ItemsSelect` is a reusable item selector; its `ItemType` and `ItemsType` types are exported alongside it.
- `useAuthState` holds persisted authentication state.
- `cacheLastResult()` wraps a function to cache its last result.

These are building blocks for an application UI. The package does not provide a complete application shell or the planned administration interface.

## Shared utilities

`shared/utils/datetime.js` exports `isValidDateTime()`, `assertValidDateTime()`, `toValidDateTime()`, and `utcToday()` for Luxon `DateTime` values. Shared API schemas and inferred types for legacy authentication and synchronization are in `shared/api/auth.js` and `shared/api/sync.js`.

## Development

```sh
npm install
npm run build
npm test
```

The package uses TypeScript, Vitest, ESLint, and Prettier. Read `spec/` before changing behavior, keep it current when a design or contract changes, and track accepted future work in `todo.md`.
