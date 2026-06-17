# Changelog

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
