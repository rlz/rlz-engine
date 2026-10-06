# Design decisions

These are decisions evidenced by the current implementation. Add or revise entries when behavior changes; include context and trade-offs so future maintainers can evaluate the choice.

## Focus rlz-engine on low-overhead pet projects

**Decision:** `rlz-engine` is a set of supporting tools for pet projects. It should solve as many recurring tasks as possible in a consistent way while avoiding broad, universal abstractions and keeping administrative work low.

**Reason:** Pet projects benefit more from predictable defaults and less operational overhead than from a framework that can accommodate every deployment shape.

## Use npm for package management

**Decision:** Use npm with the root `package-lock.json` to install and lock dependencies. The repository is a single package and does not need a pnpm workspace configuration.

**Reason:** Using npm avoids requiring a separate package manager while retaining reproducible installs through npm's lockfile. The trade-off is that dependency resolution and installation layout follow npm semantics.

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

**Decision:** Planned work will replace Pino with `SystemLogger` and `AuditLogger`. Log calls use structured JavaScript objects. `SystemLogger` will provide the interface needed by Fastify, use module `SYSTEM`, and forward all records to `AuditLogger`. Production SystemLogger output will be readable, one line per record, for stdout/journald. In development, AuditLogger will provide colored readable console output, so SystemLogger does not need a second console sink. Audit records contain time, level, module, message, and optional error details including stack trace; non-JSON-serializable structured values and sensitive information must not be logged.

**Reason:** Pino's worker-based transports add operational and build complexity the project wants to avoid. Keeping records structured at the logger boundary supports both readable developer output and durable querying without requiring JSON-formatted console output.

## Store and query audit logs in SQLite

**Decision:** Planned production audit storage will use Node's built-in SQLite support in `logs.sqlite` in the application working directory. Retention age and a global maximum record count will be configured at initialization. A periodic cleanup (planned hourly) will remove records older than the retention age and, additionally, the oldest records beyond the configured maximum; cleanup may use a small margin to reduce repeated deletion work. Required indexes will be created before server loggers start. Audit storage failures must not stop SystemLogger. An administrative RPC will filter by module, level, and time range, order stably by time and record ID, and cap pages at 1000 records.

**Reason:** A local database provides searchable operational history without adding an external service for the one-process-per-VM deployment model. Age and count limits bound disk usage; asynchronous best-effort audit persistence keeps logging failures from taking down application work.

## Migrate all RPC authentication to Bearer tokens compatibly

**Decision:** All RPC endpoints and the browser RPC helper accept `Authorization: Bearer <userId:password>` as well as the legacy `Authorization: userId:password` format. The Bearer scheme wraps the current credential pair so existing endpoint auth callbacks remain compatible; an opaque token contract would require an explicit token validation API. Administrative RPC calls are planned to use Bearer authentication with a secret whose cryptographic hash is stored in `./auth/admin-secret`; if the file is absent, administrative RPC access will be unavailable. Production application RPC routes are served over TLS; the unsecure production server is reserved for ACME HTTP-01 and redirects.

**Reason:** Bearer is a standard authorization scheme and can be adopted without changing the current credential-validation callback. Temporarily accepting both header formats allows existing clients to continue working. The trade-off is that the Bearer payload still has the legacy credential structure; a future opaque-token design needs a separate validation contract. TLS protects credentials in transit, while storing only a hash avoids keeping the administrative secret in plaintext on disk.

## Generate administrative secrets instead of allowing operator-selected values

**Decision:** Planned administration tooling will provide only a command to generate and reset the admin secret, not set an operator-chosen value. It will generate a cryptographically random, keyboard-friendly secret, store only its password-hash representation in `./auth/admin-secret`, and print the plaintext once. Replacing the secret invalidates the previous value. The file will be written with restrictive permissions and atomically replaced.

**Reason:** Generated secrets avoid weak or reused human-selected passwords while remaining practical to type. Printing once keeps the plaintext out of persistent application storage; atomic replacement and restrictive permissions reduce exposure and avoid partially written credentials.

## Provide an embeddable React administration UI

**Decision:** Planned work will provide a reusable React administration UI that applications can mount at `/.adm`. The UI will prompt for the generated admin secret, authenticate its administrative RPC requests with Bearer authorization, and keep the credential in memory only so a page reload requires re-entry. Applications will be able to register administration modules. Initial modules will include audit-log browsing through the audit RPC and certificate status showing issue time, expiration time, time until planned renewal, and overdue renewal state.

**Reason:** A shared embeddable UI lets applications expose consistent operational tools without each project building its own administration surface. A module registration boundary allows application-specific administration features to be added without changing the shared shell. Keeping credentials in memory limits persistence in the browser, with the trade-off that operators re-enter the secret after reload.

## Bundle reusable capabilities as opt-in module facets

**Decision:** Modules may be authored in an application or provided by `rlz-engine`, using the same opt-in composition style. Planned modules expose independently selectable `rpc`, `admRpc`, `adm`, and `cli` facets. User RPC and administrative RPC are separate concepts in the RPC registration system: user RPC uses the normal user authentication policy and `/rpc/...` routes; `admRpc` uses the administrative Bearer secret and an administrative route under `/.adm`. The `adm` facet contributes UI sections and may rely on `admRpc`; the `cli` facet contributes commands to the common application CLI using `node app.js <plugin> <cmd> <args...>`, with the plugin name as command namespace. Applications compose selected facets rather than reimplementing their integration glue. Logging/audit and certificate administration are initial candidates.

**Reason:** Keeping each capability's RPC, user interface, and command-line integration together makes library features easy to adopt while allowing applications to opt into only the parts they use. Independent facets avoid forcing a UI or command dependency on applications that only need an RPC capability.

## Improve testability as the library evolves

**Decision:** As `rlz-engine` develops, improve its design and structure to make library behavior easier to test. Use Vitest as the test framework.

**Reason:** Testing should be a practical part of maintaining and extending the library, helping catch regressions while keeping future changes manageable. This records a development direction and tooling choice; it does not claim that a test suite or Vitest setup is already in place.

## Define RPC contracts with Zod

**Decision:** RPC endpoint body and response schemas are Zod schemas, and routes validate both request and response data.

**Reason:** A single runtime schema can validate data at the network boundary and serve as the source for generated TypeScript client types. Endpoint versions in route names allow contracts to evolve explicitly.

## Provide client API generation from backend endpoints

**Decision:** The engine provides a generator that derives typed RPC client methods from backend endpoint registrations and their schemas. A demo consumer was removed from this repository; applications can use the generator in their own build process.

**Reason:** This keeps client method names, versions, and data types derived from the server contract instead of maintaining a parallel handwritten definition.

## Keep shared sync metadata small

**Decision:** Synchronization first exchanges IDs and `lastModified` timestamps, then transfers full objects by ID only when needed.

**Reason:** The client can compare local and remote state without downloading every object on each sync. This requires consistent modification timestamps and leaves conflict/application merge policy to the caller.

## Separate development and production server setup

**Decision:** Development uses one HTTP server; production runs an HTTP challenge/redirect server alongside a secure HTTP/2 server that accepts HTTP/1.

**Reason:** Local development does not need public TLS certificate issuance, while production needs an HTTP-01 endpoint and TLS for application traffic.

## Reconcile MongoDB indexes from configuration

**Decision:** `MongoStorage.createIndexes` removes non-system indexes not present in the supplied configuration and creates configured indexes that are missing.

**Reason:** The configured list acts as the desired index state. This keeps deployed collections aligned with application expectations, but makes index configuration changes operationally significant because unlisted indexes are dropped.
