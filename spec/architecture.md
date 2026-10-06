# Architecture

This note describes the current structure of the `engine` package. The sibling `sample-project` is an example application and build-time consumer; it is not part of the published engine package.

## Package layout

- `engine/src/back` contains Fastify server setup, RPC registration, authentication, and MongoDB storage helpers.
- `engine/src/client` contains browser-side RPC transport, generated API usage, synchronization logic, and client state.
- `engine/src/shared` contains schemas and types used across the client/server boundary, plus shared utilities.
- `sample-project` demonstrates a backend and frontend, and generates a typed RPC client from the server's RPC definitions.

The package exports compiled `back`, `client`, and `shared` modules from `engine/dist` according to `engine/package.json`.

## RPC contract and code generation

RPC endpoints are declared with `RpcPluginBuilder` in `engine/src/back/rpc/rpc.ts`. Each endpoint carries a name, integer version, Zod body and response schemas, and an action. Registered routes use `/rpc/<plugin>_<endpoint>_v<version>`; authenticated endpoints call their auth function before their action.

`engine/src/back/rpc/gen.ts` turns registered endpoint schemas into TypeScript body/response types and a client object. The sample project's generator imports the backend RPC definitions and writes the generated API consumed by the frontend. Keep endpoint versions, shared schemas, and generated client expectations aligned when changing a contract.

## Authentication and client transport

The browser RPC helper serializes requests as JSON, compresses bodies larger than 16 KiB with gzip, and adds an authorization header for authenticated calls. It maps common HTTP statuses to dedicated error classes. The backend RPC registration parses the authorization header into user ID and password values, delegates validation to the endpoint's auth callback, then invokes the action.

The auth endpoint implementations and persistence live under `engine/src/back/auth`; browser login state lives in `engine/src/client/state/auth.ts` and is persisted by Zustand.

## Data synchronization

The shared synchronization schemas define the wire format for listing comparison metadata, fetching objects by ID, and pushing objects. Server storage helpers list an owner's object IDs and `lastModified` values, optionally filtered by a sync timestamp. The client compares those timestamps with local items: newer local items are pushed, while newer or previously unknown remote items are fetched and passed to the local update callback.

The sync helpers coordinate metadata and transfer; application-specific merging and durable client storage are supplied by their callers.

## Storage and server lifecycle

`MongoStorage` wraps MongoDB access and reconciles configured collection indexes by removing obsolete named indexes and creating missing ones. Storage model helpers use string UUIDs and carry owner and synchronization metadata.

`runServer` configures Fastify. Development serves on the unsecure port with CORS and static routes. Production starts the HTTP server for ACME HTTP-01 and redirects, obtains the certificate, then starts an HTTP/2-capable TLS server with HTTP/1 fallback and periodic certificate renewal. Both servers are closed by the returned shutdown function.
