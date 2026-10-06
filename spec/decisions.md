# Design decisions

These are decisions evidenced by the current implementation. Add or revise entries when behavior changes; include context and trade-offs so future maintainers can evaluate the choice.

## Define RPC contracts with Zod

**Decision:** RPC endpoint body and response schemas are Zod schemas, and routes validate both request and response data.

**Reason:** A single runtime schema can validate data at the network boundary and serve as the source for generated TypeScript client types. Endpoint versions in route names allow contracts to evolve explicitly.

## Generate the client API from backend endpoints

**Decision:** The sample project generates its typed RPC client from the backend endpoint registrations and their schemas.

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
