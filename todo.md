# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- Revisit the Zod JSON Schema `allOf` override in `src/back/rpc/rpc.ts` when the linked Zod issue is resolved; remove the workaround if the generated schemas no longer need it.
- Replace Pino and its worker build integration with structured `SystemLogger` and `AuditLogger`; preserve the Fastify logger interface, send production SystemLogger records to readable single-line stdout, and render development audit records in color.
- Add production SQLite audit storage at `logs.sqlite` with configured retention age and global record limit, indexed queries by module/level/time, hourly cleanup with a small deletion margin, and audit failure isolation from SystemLogger.
- Add administrative RPC for audit-log queries with stable time-and-ID ordering and page size capped at 1000; protect it with a hashed admin secret from `./auth/admin-secret` and deny access when the file is absent.
- Add `Authorization: Bearer` support to all RPC methods and clients while retaining the existing `userId:password` authorization format during migration; serve production application RPC over TLS.
- Add a secret-generation/reset command that creates a keyboard-friendly random admin secret, stores only its password hash in `./auth/admin-secret` with restrictive permissions and atomic replacement, and prints the plaintext once.
- Provide a reusable React administration UI mountable at `/.adm`, with in-memory Bearer credential handling and a module registration API; include audit-log and certificate-status modules.
- Expose certificate issue/expiration and renewal status through an administrative RPC contract so the certificate module can show when it was issued, when it expires, time until planned renewal, and whether renewal is overdue.
- Define an opt-in module composition API usable by both application-authored and `rlz-engine` modules, with independently selectable `MODULE.rpc`, `MODULE.admRpc`, `MODULE.adm`, and `MODULE.cli` facets. Extend RPC registration so admin RPC is a distinct endpoint type and route under `/.adm`, protected by the admin Bearer secret, separate from user-authenticated `/rpc/...` endpoints. Provide application startup, admin UI registration, and CLI aggregation glue; module CLI commands use `node app.js <plugin> <cmd> <args...>`.
