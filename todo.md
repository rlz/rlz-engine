# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- Add automated coverage for RPC contract validation and generated client consistency, sync timestamp comparisons, and MongoDB index reconciliation.
- Revisit the Zod JSON Schema `allOf` override in `engine/src/back/rpc/rpc.ts` when the linked Zod issue is resolved; remove the workaround if the generated schemas no longer need it.
