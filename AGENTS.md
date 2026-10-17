# Working notes for future changes

- Read `spec/` before changing behavior. Treat it as the record of current design and the reasons behind established decisions.
- Use English only in source code, including identifiers, comments, documentation comments, log messages, and user-facing strings embedded in source files.
- Keep `spec/` current when a change alters architecture, persistence, API or protocol behavior, compatibility, or an explicit design decision. Record the reason and relevant trade-offs, not just the implementation.
- Track accepted future work in the root `todo.md`. Remove or mark an item when it is completed; do not turn speculative ideas into commitments.
- Add concise source comments where they explain design intent, an invariant, a non-obvious constraint, or why an implementation choice exists. Avoid comments that merely restate the code.
- After each task, consider whether tests are needed to cover the change or prevent regressions; add and run appropriate tests when they would provide useful coverage.
- When changing an existing decision, update the relevant spec note in the same change and explain the transition or compatibility impact.
- Keep notes evidence-based: distinguish current behavior from open questions and planned work.
- Do not add `index.ts` files that only re-export modules; import directly from implementation modules.
- Avoid standalone `types.ts` files. Define types alongside the implementation or feature that owns them; create a separate type module only when a concrete design need justifies it.
