# Literal I18n

[中文](README.md) | [English](README.en.md)  |  [GitHub](https://github.com/gguser1995-spec/literal-i18n) | [Gitee](https://gitee.com/lwfux/literal-i18n)

Literal I18n is a React / Next.js i18n library that uses literal source text as the translation source.

Instead of maintaining keys such as `home.title`, you write the UI text directly:

```tsx
import { T } from 'literal-i18n';

<T text="Hello {name}" name={user.name} />
```

The extractor scans static source text from your code, writes JSON files, and fills target locales through your own async translation hook.

## Before You Start

Decide these items first:

- Source locale: for example `en`
- Target locales: for example `zh`, `de`, `ja`
- Message output directory: for example `src/messages`
- Key mode: `source` or `hash`
- Translation implementation: your own `translateJsonHook`, or one of the optional OpenAI-compatible helpers

For production projects, hash keys are recommended. Put these values in `literal-i18n.config.mjs`; if your runtime also reads them from env, mirror them in `.env`:

```env
NEXT_PUBLIC_LITERAL_I18N_KEY_MODE=hash
NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX=m_
NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH=16
```

## Install

```bash
npm install literal-i18n
```

Create a shared config file first. Both the Next plugin and the CLI can use it:

```js
// literal-i18n.config.mjs
import { defineLiteralI18nConfig } from 'literal-i18n/next';

export default defineLiteralI18nConfig({
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  sourceMapOutput: 'src/messages/source-map.json',
  localeDir: 'src/messages',
  locales: ['en', 'zh', 'de'],
  sourceLocale: 'en',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
  async translateJsonHook(input) {
    return await translateMissingTexts(input);
  },
});
```

The CLI automatically reads `literal-i18n.config.mjs`, `.js`, `.cjs`, `.ts`, or `.json` from your project root.

For Next.js 16 or Turbopack builds, prepare an explicit extract script:

```json
{
  "scripts": {
    "i18n:extract": "literal-i18n-extract",
    "i18n:watch": "literal-i18n-extract --watch",
    "build": "npm run i18n:extract && next build"
  }
}
```

`i18n:extract` is not required in every project:

- With `withLiteralI18n` and webpack, the Next plugin extracts during dev/watch/build.
- With default Next.js 15 dev, only the webpack watcher runs; the internal watcher is not started.
- With Next.js 16 / Turbopack dev, `withLiteralI18n` starts an internal dev watcher automatically.
- With Next.js 16 / Turbopack build, run `i18n:extract` before `next build`.
- Without the Next plugin, or outside Next.js, use the CLI manually.

If you do not want the Next plugin to extract automatically during development, disable dev watch:

```ts
export default withLiteralI18n(nextConfig, {
  ...literalI18nConfig,
  devWatch: false,
});
```

`devWatch: true` forces the internal watcher in both Next.js 15 and Next.js 16 development. It scans once on startup, scans changed source files once per update, and skips webpack watch extraction to avoid duplicate scans.

## Configure next.config.ts

```ts
import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from './literal-i18n.config.mjs';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, literalI18nConfig);
```

This maintains:

```txt
src/messages/en.json
src/messages/zh.json
src/messages/de.json
src/messages/source-map.json
```

If you use multiple Next plugins, compose them:

```ts
export default withOtherPlugin(
  withLiteralI18n(nextConfig, literalI18nConfig),
);
```

### Next.js 16 and Turbopack

When `withLiteralI18n` detects Next.js 16 and no `turbopack` config, it adds an empty `turbopack: {}` to avoid the "webpack config without turbopack config" error.

Default Next.js 15 dev uses webpack, so `withLiteralI18n` only uses the webpack watch hook and does not start the internal dev watcher.

Default Next.js 16 dev leans toward Turbopack, where webpack hooks may not run. In that mode, `withLiteralI18n` starts an independent dev watcher for initial extraction and incremental updates. If you explicitly run `next dev --webpack`, the internal watcher is disabled and extraction is handled by the webpack hook.

For Turbopack build, still run the CLI before `next build`:

```bash
npm run i18n:extract && next build
```

If you want webpack hooks for build-time extraction:

```bash
next build --webpack
```

## CLI Extraction

Default usage:

```bash
literal-i18n-extract
```

Specify a config file:

```bash
literal-i18n-extract --config ./configs/i18n.mjs
```

Override config with CLI flags:

```bash
literal-i18n-extract src \
  --out src/messages/en.json \
  --source-map-out src/messages/source-map.json \
  --key-mode hash \
  --id-prefix m_ \
  --id-length 16 \
  --locales en,zh,de \
  --source-locale en
```

Priority:

```txt
CLI flags > NEXT_PUBLIC_LITERAL_I18N_* env vars > literal-i18n.config.* > defaults
```

Watch mode:

```bash
literal-i18n-extract --watch
```

Use `--watch` when you are not using the Next plugin, or when you set `devWatch: false` and want the CLI to own development extraction. By default, Next.js 15 dev is handled by webpack watch, while Next.js 16 / Turbopack dev is handled by the internal watcher.

## Configure I18nProvider

In App Router, prefer `getI18nProviderProps(locale)` in the locale layout. It reads `literal-i18n.config.*` and loads the current locale JSON, `source-map.json`, `keyMode`, `idPrefix`, and `idLength` for you:

```tsx
import { I18nProvider } from 'literal-i18n';
import { getI18nProviderProps } from 'literal-i18n/server';

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  const i18n = await getI18nProviderProps(locale);

  return (
    <I18nProvider {...i18n}>
      {children}
    </I18nProvider>
  );
}
```

Messages are flat JSON:

```json
{
  "m_073083b5b1d08690": "Hello world"
}
```

`loadMessages` accepts a custom locale directory as the second argument:

```ts
const messages = await loadMessages(locale, 'locales');
```

If you use `loadMessages` manually with hash mode, also pass the key settings from config into `I18nProvider`. `getI18nProviderProps` is preferred because it avoids duplicating config.

If your locale comes from route params such as `/en` or `/zh`, each locale normally maps to a separate route and works well with SSG/SSR.

If your locale comes from cookies, headers, middleware, or proxy and should vary per request, force dynamic rendering:

```ts
import { headers } from 'next/headers';

export default async function LocaleLayout({ children }) {
  await headers(); // force dynamic when locale depends on request state

  return children;
}
```

Otherwise, Next may statically embed messages read at build time.

## Component Usage

```tsx
import { T } from 'literal-i18n';

<T text="Hello World" />
<T text="Hello {name}" name={user.name} />
```

Except for `text`, `id`, and `params`, all other props passed to `<T />` are interpolation params:

```tsx
<T text="my name is {name}" name="wang huahua" />
```

Equivalent to:

```tsx
<T
  text="my name is {name}"
  params={{ name: 'wang huahua' }}
/>
```

`<T />` supports ReactNode interpolation:

```tsx
<T
  text="my name is {name}"
  name={<span className="text-red-500">Tom</span>}
/>
```

In Next.js App Router, if you pass ReactNode interpolation such as `<span />`, put that usage inside a client component:

```tsx
'use client';

import { T } from 'literal-i18n';

export function NameLine() {
  return (
    <T
      text="my name is {name}"
      name={<span className="text-red-500">Tom</span>}
    />
  );
}
```

In Server Components, prefer plain string/number params. Passing ReactNode from a Server Component to a Client Component prop can cross a serialization boundary and cause hydration issues.

## Client Component Strings

Use `useTranslate()` when you need a string in a client component:

```tsx
'use client';

import { useTranslate } from 'literal-i18n';

export function Title() {
  const { tr } = useTranslate();

  return <h1>{tr('I am a test')}</h1>;
}
```

Aliasing is supported and extractable:

```tsx
const { tr: t } = useTranslate();

t('Client text');
```

## Next.js Server Usage

When you already have a route locale:

```ts
import { getLocaleTranslator } from 'literal-i18n/server';

const { tr } = await getLocaleTranslator(locale);

tr('Hello {name}', { name: user.name });
```

`getLocaleTranslator(locale)` reads `src/messages/{locale}.json` and `src/messages/source-map.json` by default. In hash mode, you can still call `tr` with source text directly; you do not need to pass `keyMode`, `idPrefix`, or `idLength` again:

```ts
const { tr } = await getLocaleTranslator('zh');

tr('Server rendered text');
```

If your message directory is not `src/messages`, pass `localeDir`:

```ts
const { tr } = await getLocaleTranslator(locale, {
  localeDir: 'app/messages',
});
```

To infer locale from the Next request header:

```ts
import { getTranslator } from 'literal-i18n/server';

const { tr } = await getTranslator();

tr('Server rendered text');
```

`getTranslator()` also loads `source-map.json` automatically so source text can resolve to hash keys.

## Non-Component Usage

Do not depend on global state outside components. Create an explicit translator:

```ts
import { createTranslator } from 'literal-i18n';

const t = createTranslator({
  locale,
  messages,
  keyMode: 'hash',
});

t('Hello {name}', { name: 'Tom' });
```

## Use id to Disambiguate Context

The same source text can need different translations. For example, `Post` may mean a verb or a noun. Use `id` to separate contexts:

```tsx
<T text="Post" id="button" />
<T text="Post" id="noun" />
```

```ts
const { tr } = useTranslate();

tr('Post', undefined, { id: 'button' });
tr('Post', undefined, { id: 'noun' });
```

Source mode produces:

```json
{
  "Post_button": "Publish",
  "Post_noun": "Post"
}
```

Hash mode includes `text + id` in the hash input:

```json
{
  "m_xxxx": "Publish",
  "m_yyyy": "Post"
}
```

`id` is only for translation context. It is not an interpolation param. To interpolate `{id}`, use `params`:

```tsx
<T text="ID is {id}" params={{ id: userId }} />
```

## AST Extraction Rules

By default, only APIs imported from these modules are recognized:

```ts
import { T, useTranslate, createTranslator } from 'literal-i18n';
import { getTranslator, getLocaleTranslator } from 'literal-i18n/server';
```

Supported:

```tsx
<T text="Hello World" />
<T text="Post" id="button" />
<T text="Hello {name}" name={user.name} />
```

```tsx
const { tr } = useTranslate();
tr('Client text');
tr('Post', undefined, { id: 'button' });
```

```ts
const { tr: t } = await getLocaleTranslator(locale);
t('Server text');
```

```ts
const t = createTranslator({ locale, messages });
t('Dictionary text');
```

Unsupported dynamic text or dynamic id:

```tsx
<T text={title} />
<T text={`Hello ${name}`} />
<T text="Post" id={type} />
tr(variable)
tr(getTitle())
tr('Post', undefined, { id: type })
```

These patterns emit warnings during extraction.

If you wrap your own entry point:

```ts
withLiteralI18n(nextConfig, {
  importSources: ['literal-i18n', '@/components/i18n'],
});
```

## Translation Hooks

Async translation should happen during extraction / JSON generation. Runtime rendering only reads JSON synchronously.

Implement your own `translateJsonHook` or `translateHook` to connect terminology, cache, retries, review, and logs.

### `translateJsonHook`

Recommended for batch translation:

```ts
withLiteralI18n(nextConfig, {
  locales: ['zh'],
  sourceLocale: 'en',
  async translateJsonHook({ locale, sourceLocale, missingTexts, missingMessages }) {
    return await myTranslateBatch({
      locale,
      sourceLocale,
      texts: missingTexts,
      messages: missingMessages,
    });
  },
});
```

Return:

```ts
Record<string, string> | undefined
```

Keys can be source text or generated message keys. For repeated source text with different `id`, returning generated message keys is recommended to avoid context collisions.

Input shape:

```ts
type TranslateJsonHookInput = {
  locale: string;
  sourceLocale: string;
  missingTexts: string[];
  missingMessages?: Array<{
    key: string;
    text: string;
    id?: string;
  }>;
  sourceMessages?: Record<string, string>;
  existingMessages?: Record<string, unknown>;
};
```

Returning `{}` or `undefined` keeps source text for missing entries, so they can be filled later.

### `translateHook`

For one-by-one translation:

```ts
withLiteralI18n(nextConfig, {
  async translateHook({ text, key, id, locale, sourceLocale }) {
    return await myTranslateOne({ text, key, id, locale, sourceLocale });
  },
});
```

Return:

```ts
string | undefined
```

Input shape:

```ts
type TranslateTextHookInput = {
  text: string;
  key?: string;
  id?: string;
  locale: string;
  sourceLocale: string;
};
```

Returning a string writes it to the target locale JSON. Returning `undefined` keeps the source text.

## Optional Translation Helpers

The package provides a few optional helpers for existing services. You are encouraged to write your own translation function when your product needs custom terminology, review, or caching.

```ts
import { createOpenAICompatibleTranslateJsonHook } from 'literal-i18n/local-translate-api';

const translateJsonHook = createOpenAICompatibleTranslateJsonHook({
  baseUrl: process.env.TRANSLATE_API_BASE_URL!,
  apiKey: process.env.TRANSLATE_API_KEY!,
  model: process.env.TRANSLATE_MODEL!,
  prompt: 'Translate concise UI copy.',
});
```

If you wrap a helper, pass the input through:

```ts
const deepseekHook = createOpenAICompatibleTranslateJsonHook({
  baseUrl: process.env.TRANSLATE_API_BASE_URL!,
  apiKey: process.env.TRANSLATE_API_KEY!,
  model: process.env.TRANSLATE_MODEL!,
});

withLiteralI18n(nextConfig, {
  async translateJsonHook(input) {
    return deepseekHook(input);
  },
});
```

```ts
import { createLocalTranslateJsonHook } from 'literal-i18n/local-translate-api';

const translateJsonHook = createLocalTranslateJsonHook({
  endpoint: process.env.TRANSLATE_API_ENDPOINT!,
  prompt: 'Translate concise UI copy.',
});
```

The docs do not assume a specific local service or model. You can use DeepSeek, any OpenAI-compatible API, your own service, or a fully custom implementation.

## Hash Key Mode

Source mode uses source text directly as the key:

```json
{
  "Hello World": "Hello world"
}
```

Hash mode:

```json
{
  "m_073083b5b1d08690": "Hello world"
}
```

`sourceMapOutput` is optional. In hash mode, it writes `source text -> hash key` for debugging:

```ts
sourceMapOutput: 'src/messages/source-map.json'
```

With `id`, source-map keys look like `source_id`:

```json
{
  "Post_button": "m_xxxx",
  "Post_noun": "m_yyyy"
}
```

Source mode usually does not need `sourceMapOutput`, because the key is already the source text.

Server helpers also use `source-map.json` as a runtime lookup aid. For example, `getLocaleTranslator(locale)` first tries the direct key; if that misses, it uses source-map to resolve source text to the hash key, then reads the translated value from the current locale JSON.

## API Reference

### `literal-i18n`

- `T`
- `I18nProvider`
- `useTranslate()`
- `useI18n()`
- `createTranslator(options)`
- `createMessageId(text, options)`
- `getMessageKey(text, options)`
- `getEnvMessageIdOptions()`
- `defaultTranslate`

### `literal-i18n/server`

- `loadMessages(locale, localeDir?)`
- `loadSourceMap(localeDir?)`
- `loadLiteralI18nConfig(cwd?)`
- `getI18nProviderProps(locale, options?)`
- `getTranslator(input?)`
- `getLocaleTranslator(locale, options?)`

Common `getI18nProviderProps` / `getTranslator` / `getLocaleTranslator` options:

- `localeDir`: message directory, default `src/messages`
- `sourceMap`: pass a source-map manually; when omitted, `${localeDir}/source-map.json` is loaded automatically
- `keyMode` / `idPrefix` / `idLength`: optional. In hash mode, you usually do not need to pass them because server helpers resolve through source-map.

### `literal-i18n/next`

- `withLiteralI18n(nextConfig, options)`
- `defineLiteralI18nConfig(options)`
- `LiteralI18nNextPlugin`

Common options:

- `sourceDir` / `sourceDirs`
- `sourceOutput`
- `sourceMapOutput`
- `localeDir`
- `locales`
- `sourceLocale`
- `keyMode` / `idPrefix` / `idLength`
- `importSources` / `serverImportSources`
- `translateHook`
- `translateJsonHook`
- `onExtract`
- `keepStale`
- `treatSourceAsMissing`
- `pruneLegacySourceKeys`
- `progress` / `silent`
- `devWatch`

`devWatch` controls automatic extraction in development:

- `true`: force the internal watcher in development. Startup and source changes are scanned, webpack watch extraction is skipped, and each change is extracted once.
- `false`: do not extract automatically in development. Run the CLI manually, or use `literal-i18n-extract --watch`.
- Unset: Next.js 15 defaults to webpack watch; Next.js 16 defaults to the internal watcher.

### `literal-i18n/local-translate-api`

- `createLocalTranslateJsonHook(options)`
- `createOpenAICompatibleTranslateJsonHook(options)`
- `createDeepSeekTranslateJsonHook(options)`

---

## ❓ Need Help?

If you encounter a bug, have a feature request, or have questions about configuration or usage, please open an issue on GitHub:

**👉 https://github.com/gguser1995-spec/literal-i18n/issues**

⚠️ **Please file an Issue first. Direct Pull Requests will not be accepted.**
