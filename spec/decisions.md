# Design decisions

These are decisions evidenced by the current implementation. Add or revise entries when behavior changes; include context and trade-offs so future maintainers can evaluate the choice.

## Focus rlz-engine on low-overhead pet projects

**Decision:** `rlz-engine` is a set of supporting tools for pet projects. It should solve as many recurring tasks as possible in a consistent way while avoiding broad, universal abstractions and keeping administrative work low.

**Reason:** Pet projects benefit more from predictable defaults and less operational overhead than from a framework that can accommodate every deployment shape.

## Deploy one application per virtual machine

**Decision:** Applications using `rlz-engine` are deployed to network-accessible virtual machines, with one application per VM. The deployment model does not require Docker.

**Reason:** A dedicated VM per application gives a simple deployment and isolation model without adding container management to the project's administrative workload.

## Manage production TLS certificates in rlz-engine

**Decision:** `rlz-engine` takes responsibility for production TLS certificate management for applications exposed on the network.

**Reason:** Centralizing certificate issuance and renewal reduces per-application administrative work. The current server lifecycle already provisions and renews certificates using ACME HTTP-01.

## Plan an in-application administration interface

**Decision:** The project plans to provide an administration interface within the application, including a way to inspect application state and logs.

**Reason:** Operators should be able to check basic application health and diagnostics from the application itself, reducing the need for separate operational tooling. This is planned work, not a currently available feature.

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
