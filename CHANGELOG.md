# Changelog

## 0.1.10 (2026-06-17)

### Changed

- `treatSourceAsMissing` now defaults to `false`, so target translations that intentionally match the source text are not retranslated on each extraction.
- Missing target translations are no longer written as source-text placeholders, allowing untranslated entries to keep flowing through `translateJsonHook` on later extractions.

### Documentation

- Documented the `treatSourceAsMissing` default in `README.md` and `README.en.md`.
- Removed duplicated Markdown docs under `docs/`; the root README files are now the canonical documentation.

## 0.1.8 (2026-06-15)

### Fixed

- **`getI18nProviderProps` / `loadLiteralI18nConfig` 在 Next.js webpack 打包环境下配置加载失败的问题。**  
  当动态 `import()` 被 webpack 拦截时，自动回退到从源文件中正则提取简单运行时配置（`localeDir`、`keyMode`、`idPrefix`、`idLength`），确保 Next.js 15 + App Router 下能正常使用 `getI18nProviderProps(locale)`。

### Added

- Next.js 16 初步支持验证。
- 新增 `demo/`（Next.js 15）和 `demo-next-16/`（Next.js 16）示例项目。

## 0.1.7 (2026-06-15)

- 发布到 npm 并弃用 0.1.5。

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
