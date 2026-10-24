# TODO

Future work, kept separate from current behavior. Add only agreed or clearly actionable items and update the list as work is completed.

- [x] Подготовлен `rlz-engine@1.0.69`: `AdminApp` использует круглую иконку выхода, меньшие отступы основной области и всю доступную ширину контента. Публикация остаётся за пользователем.
- [x] Подготовлен `rlz-engine@1.0.70`: Certificate admin RPC принимает строку либо sync/async domain provider, вычисляя домен при запросе статуса. Публикация остаётся за пользователем.
- [x] В `rlz-engine@1.0.68` RPC-клиент начал генерировать Luxon `DateTime<true>` для ISO date/datetime и `Duration` для duration; сгенерированные методы содержат явные преобразования полей по Zod-схеме, ISO time остаётся строкой.

- Replace the TypeScript 6 Compiler API compatibility package with TypeScript 7 when TypeScript 7 exposes a suitable API and `zod-to-ts` supports it.
- Add a reusable project scaffold and refresh utility for the canonical application setup, including managed Oxlint/Oxfmt settings that preserve unrelated project configuration.
