# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- [x] Подготовлен `rlz-engine@1.0.65`: обновлены зависимости в доступных semver-диапазонах, Zod повышен до `^4.6.7`, Oxfmt — до `^0.74.0`, RPC-генератор исправлен; тесты, проверки типов, lint, форматирование и `npm pack --dry-run` прошли. Публикация остаётся за пользователем.

- Replace the TypeScript 6 Compiler API compatibility package with TypeScript 7 when TypeScript 7 exposes a suitable API and `zod-to-ts` supports it.
- Add a reusable project scaffold and refresh utility for the canonical application setup, including managed Oxlint/Oxfmt settings that preserve unrelated project configuration.
