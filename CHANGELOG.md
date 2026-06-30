# Changelog

## 0.2.7 (2026-06-30)

### Added

- Added route-level client message supplements for persistent providers. `I18nProvider` now listens for client pathname changes, loads the current route package through the default `/api/literal-i18n/messages` endpoint, and merges it with existing messages.
- Added `literalI18nMessagesGET` for Next.js App Router API routes, plus the standalone `literal-i18n/client-loader` export for default or custom message loading.
- Added `literal-i18n init` generation for `src/app/api/literal-i18n/messages/route.ts`.

### Changed

- Changed the default `getI18nProviderProps(locale)` payload scope back to strict current-route pruning. `payloadScope: "navigation"` remains available as an explicit opt-in for persistent layout client navigation, but it intentionally sends other pages in the same locale navigation tree.

### Fixed

- Deferred client route-change notifications from patched `history.pushState` / `history.replaceState`, preventing React from reporting `useInsertionEffect must not schedule updates` during Next.js client navigation.

### Tests

- Updated runtime coverage to assert that default route pruning excludes sibling route keys while explicit navigation scope includes them.
- Added runtime coverage for the default messages API handler and client route messages loader.

## 0.2.5 (2026-06-23)

### Fixed

- Fixed development extraction fallback when Next.js starts the internal watcher in a short-lived config process. Webpack watch extraction now remains enabled unless a watcher is actually active in the current compiler process, preventing source edits such as `<T text="powered by" />` from being missed.

### Tests

- Added runtime regression coverage for the Next.js dev watch fallback.

## 0.2.4 (2026-06-23)

### Added

- Added current-locale documentation for client hooks and server helpers.
- Added GUI copy search that filters against the selected locale's JSON value instead of literal-language detection.
- Added GUI display of extracted message context ids next to message keys.
- Added a select-all checkbox for AST-unused rows in the GUI.

### Changed

- Replaced the GUI literal-language filter with locale-aware copy search.
- Restored normal checkbox sizing in the GUI after adding the AST-unused select-all control.

### Tests

- Added GUI regression coverage for locale-aware copy search, id display, removed literal-language UI, and AST-unused select-all rendering.

## 0.2.3 (2026-06-22)

### Fixed

- Fixed App Router client navigation with persistent locale layouts. `getI18nProviderProps(locale)` now defaults to a navigation-safe payload scope, so navigating from `/zh` to `/zh/create` keeps page-specific translations available instead of falling back to source text.

### Added

- Added `payloadScope: "route"` for advanced usage that wants the previous strict current-route payload behavior and can guarantee the provider is remounted or refreshed per route.
- Added runtime regression coverage for navigation-safe provider payloads across same-locale client routes.

## 0.2.2 (2026-06-22)

### Added

- Added `npm test` as the required automated regression suite, running type checks, build, runtime contract tests, and GUI tests.
- Added runtime tests covering prop-based `tr(...)` extraction, `@/` alias route manifest dependencies, and hash-mode provider contracts.

### Fixed

- Fixed AST extraction for component props named `tr`, so placeholders and labels translated through a parent-provided translator are included in source messages and route manifests.
- Fixed `@/` alias import resolution against configured source directories, ensuring shared components such as headers are included in route-level runtime payloads.

## 0.2.1 (2026-06-21)

### Fixed

- Fixed runtime config fallback so hash-mode projects that define `keyMode` through `NEXT_PUBLIC_LITERAL_I18N_KEY_MODE` do not accidentally send `keyMode: "source"` to `I18nProvider` when Next.js cannot dynamically import the config file.
- Hash-mode clients can resolve translations from hashed message keys without requiring `includeSourceMap: true` as a workaround.
- `getI18nProviderProps` now infers hash message id options from `source-map.json` or hashed message keys when runtime config and generated message artifacts disagree.
- Runtime JSON reads now avoid async raw file-content promises, preventing Next.js dev/RSC payloads from pushing extra pretty-printed locale, manifest, or source-map JSON chunks into `view-source`.

## 0.2.0 (2026-06-21)

### Added

- Added a rewritten product-oriented documentation flow covering design philosophy, comparison with traditional i18n, development examples, GIF preview, CLI-first installation, GUI translation management, advanced details, API reference, changelog, and issue submission guidance.
- Added clearer documentation for the local GUI translation workflow, including combined filters, readonly source-map viewing, target-locale editing, clearing translations without deleting keys, single-key retranslation, AST-unused visibility, and guarded pruning.
- Added clearer setup guidance that positions `npx literal-i18n init --yes` as the recommended installation path.

### Changed

- Bumped the package version to `0.2.0`.
- Reframed the README around the intended product direction: literal-source development for engineers, repository-owned translation artifacts, and GUI-based translation control for non-developer operators.
- Clarified Next.js 16 `proxy.ts`, Turbopack behavior, route-aware runtime pruning, and payload verification expectations.

## 0.1.13 (2026-06-20)

### Added

- Added a server-side `MessageStore` that caches parsed message JSON, source maps, and runtime manifests by `mtime/size`, reducing repeated file reads when multiple server modules request i18n data.
- Added `literal-i18n/middleware` with `literalI18nMiddleware`, which forwards the current pathname through a lightweight request header for automatic route-aware runtime pruning.
- Added automatic `manifest.json` generation during extraction. The manifest records extracted message keys by file and App Router route pattern.
- Added `loadLiteralI18nManifest(localeDir?)`, `getMessageStore(localeDir?)`, and new `getI18nProviderProps` options: `includeSourceMap`, `optimizePayload`, and `pathname`.
- Added real `literal-i18n.config.ts` loading for both the CLI extractor and App Router runtime config helpers.
- Added the `literal-i18n` CLI with `init` and `extract` subcommands. `init` can generate a TS config, message directory, env example, package scripts, Next middleware/proxy, and simple Next config wrapping with dry-run support.
- Added `literal-i18n gui`, a local translation manager for filtering messages, viewing readonly `source-map.json`, editing target locale JSON, clearing valid translations, retranslating single keys, and deleting AST-unused entries after server-side validation.
- Added GUI acceptance coverage through `npm run test:gui`, including data correctness, write safety, and HTTP GUI checks.
- The config generated by `literal-i18n init` now includes a default DeepSeek `translateJsonHook` that is enabled by `LITERAL_I18N_API_KEY` and safely no-ops when the key is missing.

### Changed

- `getI18nProviderProps(locale)` no longer sends the full `source-map.json` to the client by default. Set `includeSourceMap: true` to restore the previous payload shape.
- When middleware pathname and `manifest.json` are available, `getI18nProviderProps(locale)` automatically returns route-pruned messages. Missing middleware, missing manifest, unmatched routes, or invalid manifest data fall back to full messages.
- Demo projects now verify the current package implementation during development. The Next.js 16 demo uses the `proxy.ts` convention for the pathname forwarding helper.
- `literal-i18n-extract` remains available for backwards compatibility; `literal-i18n extract` is the preferred command.

### Documentation

- Documented the runtime payload optimization flow, middleware setup, manifest output, and fallback behavior in both README files.
- Documented the local GUI translation manager in both README files.
- Added the Chinese runtime payload optimization plan in `RUNTIME_PAYLOAD_OPTIMIZATION_PLAN.md`.
- Added the Chinese GUI translation management plan in `GUI_TRANSLATION_MANAGER_PLAN.md`.

## 0.1.11 (2026-06-17)

### Changed

- `treatSourceAsMissing` now defaults to `false`, so target translations that intentionally match the source text are not retranslated on each extraction.
- Missing target translations are no longer written as source-text placeholders, allowing untranslated entries to keep flowing through `translateJsonHook` on later extractions.
- Development extraction now starts the internal watcher by default, so AST scanning runs on project startup without waiting for the first page request.
- The internal dev watcher now advances its file snapshot only after a successful extraction, and retries a full scan on the next source diff if startup extraction fails.
- Locale output writes are serialized per output file, preventing overlapping extractor instances from sending duplicate translation requests for the same missing messages.

### Documentation

- Documented the `treatSourceAsMissing` default in `README.md` and `README.en.md`.
- Removed duplicated Markdown docs under `docs/`; the root README files are now the canonical documentation.

## 0.1.8 (2026-06-15)

### Fixed

- **Fixed `getI18nProviderProps` / `loadLiteralI18nConfig` config loading in Next.js webpack bundles.**  
  When webpack intercepts dynamic `import()`, the runtime now falls back to extracting simple config values (`localeDir`, `keyMode`, `idPrefix`, `idLength`) from the source file, so `getI18nProviderProps(locale)` works correctly with Next.js 15 + App Router.

### Added

- Added preliminary Next.js 16 support validation.
- Added `demo/` (Next.js 15) and `demo-next-16/` (Next.js 16) example projects.

## 0.1.7 (2026-06-15)

- Published to npm and deprecated 0.1.5.

## 0.1.6

- Derive runtime props from literal config.

## 0.1.5

- Document server source-map lookup.

## 0.1.4

- Use source map in server translators.

## 0.1.3

- Make dev watcher run from next dev.

## 0.1.2

- Stabilize internal dev watcher.
