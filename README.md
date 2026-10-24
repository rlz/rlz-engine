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

Each backend feature exposes an uppercase `<FEATURE>_MODULE` object from `module.ts`. Applications call the factories they need and pass production facets to `rlzEngine()`.

| Module               | Facets                                    | Purpose                                     |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| `AUTH_MODULE`        | `makeRpc(storage, options?)`, `makeCli()` | Authentication RPC and admin-secret command |
| `CERTIFICATE_MODULE` | `makeCli()`, `makeAdmRpc()`, `makeAdm()`  | ACME command and certificate status         |
| `HTTP_MODULE`        | `makeCli(params, options?)`               | HTTP server command                         |
| `LOGGER_MODULE`      | `makeCli()`, `makeAdmRpc()`, `makeAdm()`  | Audit-log command, endpoint, and UI         |
| `RPC_MODULE`         | `makeDevCli(options)`                     | Development-only RPC client generation      |

`rlzEngine()` resolves server facets (`cli`, `rpc`, and `admRpc`) passed as values, arrays, or promises. Administrative UI modules are client-side inputs to `AdminApp`; they are not part of the server engine. `rlzDevEngine(engine, commands)` wraps an initialized engine instance and adds commands to its CLI tree. Only the development entry point imports this wrapper, keeping its commands out of the production bundle. HTTP lifecycle hooks remain in `HTTP_MODULE.makeCli()`.

### CLI entry points

The production entry point uses `rlzEngine()` and only registers production commands. The dev-only `rlzDevEngine()` wraps an initialized engine instance and adds development commands; the production engine has no method to add them.

```ts
import { rlzEngine } from 'rlz-engine/back/engine.js'
import { rlzDevEngine } from 'rlz-engine/back/dev-engine.js'
import { RPC_MODULE } from 'rlz-engine/back/rpc/module.js'

const engine = await rlzEngine({ cli: applicationCliModules, rpc: userRpcPlugins, admRpc: adminRpcPlugins })

// main.ts
await engine.run()

// devMain.ts, using the same engine configuration in its own process:
const devEngine = await rlzDevEngine(
    engine,
    RPC_MODULE.makeDevCli({
        rpcOutput: './src/client/rpc-client.gen.ts',
        admRpcOutput: './src/client/adm/rpc-client.gen.ts'
    })
)
await devEngine.run()
```

`rlzEngine()` resolves all facets and exposes the resulting `cli`, `rpc`, and `admRpc` lists; the administrative list includes the standard `auth.verify` endpoint. RPC dependencies are captured by endpoint declarations, often through asynchronous facet factories. RPC declarations contain no Fastify registration code. Registration follows input order. Each CLI engine builds nested help from module and command descriptions.

`HTTP_MODULE.makeCli(params, options?)` accepts server settings or a callback returning them. `http start` receives the active engine and automatically registers its user and administrative RPC modules on the HTTP server. `options.before` runs before startup; `options.after` runs after listening and receives the shutdown function. If `after` fails, the server shuts down before the error is rethrown. `RPC_MODULE.makeDevCli(options)` belongs in the separate development entry point.

## HTTP server

The server implementation is in `back/http/server.js`. Its low-level `runServer()` function accepts one `RunServerParams` object containing server settings and resolved `rpc` and `admRpc` lists. `HTTP_MODULE.makeCli()` passes those lists from the active engine automatically.

`domain`, `certDir`, and `staticDir` are required. Optional settings include `debug`, `unsecurePort`, `securePort`, `auditRetentionMs`, `auditMaxRecords`, `auditSqlite`, and `acmeProvider`. The server registers all RPC modules held by the engine. Development serves HTTP with CORS and static files. Production runs an HTTP-01 challenge and redirect server alongside a TLS server with HTTP/2 and HTTP/1 support, and renews certificates periodically. CORS is available only in development and does not allow credentials; production serves static files and RPC from the same HTTPS origin. The returned shutdown function closes the servers and logging storage. The `http start` CLI command keeps the process active until a termination signal.

Both HTTP servers redact request-body fields whose names contain `password`, `token`, `secret`, or `authorization` before Fastify serializes request data for logging. Redaction affects serialized output and keeps the values available to route handlers.

By default, non-debug production writes audit logs to `logs.sqlite`. Development and debug mode use colored console output. Set `auditSqlite: true` (or pass `--audit-sqlite` to `http start`) to write SQLite records alongside console output. Retention defaults to 30 days and the maximum record count defaults to 100,000.

## RPC endpoints and generated clients

Define user RPC groups with `rpc()` and administrative groups with `admRpc()`. Every endpoint has a version, a name, Zod body and response schemas, and an action. User endpoints may be anonymous or use a `cookieAuth` policy with both `authenticate` and `verifyCsrf` callbacks. The cookie-auth callbacks receive request cookies/headers and safe reply cookie methods via `RpcRequestContext`. The HTTP server translates these declarations into Fastify routes.

```ts
import z from 'zod'
import { rlzEngine } from 'rlz-engine/back/engine.js'
import { HTTP_MODULE } from 'rlz-engine/back/http/module.js'
import { rpc, admRpc } from 'rlz-engine/back/rpc/rpc.js'
import { authenticateSession, SESSION_IDLE_TIMEOUT_MS, verifySessionCsrf } from 'rlz-engine/back/auth/session.js'

// Assume storage is an initialized AuthStorage instance.

export const userRpc = rpc('users').add({
    name: 'get-profile',
    v: 1,
    bodySchema: z.object({}),
    respSchema: z.object({ name: z.string() }),
    cookieAuth: {
        authenticate: (context) => authenticateSession(storage, context, SESSION_IDLE_TIMEOUT_MS),
        verifyCsrf: (context, session) => verifySessionCsrf(storage, context, session)
    },
    action: (session) => ({ name: session.user.name })
})

export const adminRpc = admRpc('operations').add({
    name: 'health',
    v: 1,
    bodySchema: z.object({}),
    respSchema: z.object({ status: z.string() }),
    action: async () => ({ status: 'ok' })
})
```

Register RPC declarations with `rlzEngine()`; `http start` serves them on development and production servers automatically:

```ts
const engine = await rlzEngine({
    rpc: [userRpc],
    admRpc: [adminRpc],
    cli: [
        HTTP_MODULE.makeCli({
            production: false,
            domain: 'localhost',
            certDir: './certs',
            staticDir: './dist'
        })
    ]
})
await engine.run(['http', 'start'])
```

User endpoints are served at `/rpc/<plugin>_<endpoint>_v<version>`. Authenticated user routes use cookie sessions and require both a session authenticator and a CSRF verifier.

Cookie-auth endpoints use the same route and receive a generated client method with no credential parameter. Their `authenticate` callback reads the session cookie; `verifyCsrf` must validate the request before the action runs. `runServer()` registers `@fastify/cookie` before application routes. `back/auth/cookies.js` exports session-cookie helpers; they always use `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/` without a `Domain`. The caller can set only the cookie lifetime. `back/auth/csrf.js` provides 32-byte CSRF token generation, constant-time token comparison, and same-origin validation.

Administrative endpoints are served at `/.adm/rpc/<plugin>_<endpoint>_v<version>` and accept only `Authorization: Bearer <admin-secret>`. The secret is checked against the salted scrypt hash in `./auth/admin-secret` relative to the process working directory. Use the operational `adm reset-secret` command to create or replace it; the generated plaintext is printed once. The server caches the hash per process and path, so restart a running server after resetting the secret.

`generateClient(fileName, ...rpcBuilders)` and `generateAdmClient(fileName, ...admRpcBuilders)` in `back/rpc/gen.js` generate typed clients from endpoint schemas. The `rpc generate-client` command exposed by `RPC_MODULE.makeDevCli()` invokes these generators and writes outputs to the configured paths. Generated user methods use `rpcCall()`; generated administrative methods require `AdmAuthParam` and use `admRpcCall()`.

### RPC transport

`client/rpc.js` exports `rpcCall()`, `admRpcCall()`, `AdmAuthParam`, and `HttpError`, `Unauthorized`, `Forbidden`, and `NotFound` errors. Requests and responses are JSON. Request bodies larger than 16 KiB are gzip-compressed. User RPC uses same-origin cookie credentials and attaches the CSRF token held in client memory. Admin RPC uses a separate secret-only Bearer contract. `initFrontConfig()` configures the RPC base URL, which defaults to `/` in production and `http://localhost:8080/` otherwise.

## Authentication RPC

`back/auth` contains `AuthStorage`, signup/signin helpers, opaque server-side sessions, and the administrative-secret implementation. `AUTH_MODULE.makeRpc(storage, options?)` provides `signup`, `signin`, `session`, and CSRF-protected `logout` endpoints under `/rpc/auth_*_v1`. Set `options.sessionIdleTimeoutMs` to configure the idle timeout; it defaults to 30 minutes and must be a positive integer no greater than the fixed seven-day absolute timeout. Signup and signin set an HttpOnly session cookie and return the user profile plus a CSRF token. `session` restores the profile and token from the cookie. Session IDs are random, only their SHA-256 hashes are stored, and logout revokes the current session. Auth endpoints require a matching same-origin `Origin` header. Register the declaration in the `rpc` facets passed to `rlzEngine()`.

`SignupSigninScreen` accepts an `authClient` adapter. Pass callbacks backed by the application's generated `RPC_CLIENT.auth.signup()` and `RPC_CLIENT.auth.signin()` methods:

```ts
const authClient = {
    signup: (name, email, password) => RPC_CLIENT.auth.signup({ name, email, password }),
    signin: (name, password) => RPC_CLIENT.auth.signin({ name, password }),
    session: () => RPC_CLIENT.auth.session({})
}
```

Login profile state is available through `useAuthState` in `client/state/auth.js` and is persisted with Zustand. The CSRF token is kept only in memory; call the generated `auth.session()` endpoint on app startup to restore it from the server session before making protected RPC calls. `SignupSigninScreen` performs this restoration when mounted. Existing local profile data does not authenticate a user, and the old temporary-password field is discarded during state migration. Existing passwords remain valid: legacy scrypt hashes are verified with their original parameters and upgraded to hash version 1 on successful signin. New hashes use scrypt with `N=32768`, `r=8`, and `p=3`. The `/api/...` routes and `apiCall()` transport have been removed; RPC is the only supported application protocol.

## Logging and audit records

`LOGGER_MODULE.makeCli()` supplies `logger logs`, which reads an existing SQLite audit database in read-only mode. Supported filters are `--from`, `--to`, `--module`, `--level`, `--limit`, and `--offset`.

`LOGGER_MODULE.makeAdmRpc()` creates the `audit_logs_v1` administrative endpoint, which can be registered like other administrative RPC groups. It accepts optional time, module, level, limit, and offset filters. Pages are newest-first, ordered stably, and capped at 1,000 records; defaults are 100 records and offset 0.

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

`back/storage/sync.js` provides `getAll()` for listing an owner's object IDs and modification times. The client-side `syncItems()` helper in `client/sync.js` compares these timestamps with local items, pushes newer local objects, and fetches newer or unknown remote objects. The sync helpers do not define application-specific merging, RPC endpoint names, or durable local storage; callers provide RPC-backed item access and update behavior.

## React client components and state

- `SignupSigninScreen` provides the signup/signin screen; applications supply its `appName` and generated-client-backed `authClient` props.
- `NotFound` is the 404 screen.
- `ItemsSelect` is a reusable item selector; its `ItemType` and `ItemsType` types are exported alongside it.
- `useAuthState` holds persisted authentication state.
- `cacheLastResult()` wraps a function to cache its last result.

These are building blocks for an application UI. `AdminApp` provides a responsive administration shell with a desktop sidebar and a mobile navigation drawer, backed by React Router at `/.adm`. Register `AdmModule` values with the shell; each module supplies its own title and component, and may declare nested `routes` with a path, title, component, and optional child routes. Route components can render React Router's `Outlet` to host their child routes.

```tsx
import { AdminApp, type AdmModule } from 'rlz-engine/client/adm/admin.js'

const modules: AdmModule[] = [
    { name: 'engines', title: 'Engines', component: Engines },
    {
        name: 'operations', title: 'Operations', component: Operations,
        routes: [
            { path: 'strategies', title: 'Strategies', component: Strategies },
            { path: 'logs', title: 'Logs', component: Logs }
        ]
    }
]

<AdminApp modules={modules} />
```

Administration modules can use the shared in-memory auth state for protected RPC calls. Pair each `setAdminSecret()` call with `clearAdminSecret()` for the same owner; `getAdminAuth()` returns the current `AdmAuthParam` or throws when no module owns an authenticated session.

## Shared utilities

`shared/utils/datetime.js` exports `isValidDateTime()`, `assertValidDateTime()`, `toValidDateTime()`, and `utcToday()` for Luxon `DateTime` values. Authentication RPC schemas are owned by `back/auth/module.js`; applications generate their client types from that builder.

## Development

```sh
npm install
npm run build
npm test
```

Auth storage integration tests can run against a local MongoDB by setting `MONGODB_TEST_URI`, for example `MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test -- --run tests/auth-storage.integration.test.ts`. They create and drop a uniquely named test database.

The package uses TypeScript, Vitest, ESLint, and Prettier. Read `spec/` before changing behavior, keep it current when a design or contract changes, and track accepted future work in `todo.md`.
