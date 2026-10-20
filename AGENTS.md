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
- Develop each cohesive feature as a directory (for example, `src/back/logger/`) with a `module.ts` entry point exporting an uppercase `<FEATURE>_MODULE` object, such as `LOGGER_MODULE`.
- Put optional integration factories on that feature object using `makeCli()`, `makeDevCli()`, `makeRpc()`, `makeAdmRpc()`, or `makeAdm()` as needed. Omit facets a feature does not provide; do not add empty placeholder methods.
- Keep feature implementation and its integration factories inside the feature directory. Compose selected facets in the application entry point; development-only commands belong to `DevCliEngine` and should stay out of production CLI registration.
- Never publish packages to npm or another registry. The user performs `npm publish` and equivalent release commands; agents may prepare and locally verify a package but must not upload it.
