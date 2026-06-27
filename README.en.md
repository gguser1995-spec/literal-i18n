# Literal I18n

[中文](README.md) | [English](README.en.md) | [GitHub](https://github.com/gguser1995-spec/literal-i18n) | [Gitee](https://gitee.com/lwfux/literal-i18n)

Literal I18n is a literal-string driven i18n toolkit for React and Next.js. You write real source copy in components, and the package handles AST extraction, stable key generation, locale JSON updates, and current-route runtime message loading.

Current version: `0.2.6`

## Design Philosophy

Traditional i18n usually starts with naming keys such as `home.hero.title`, then moving the real copy into locale files. Literal I18n flips that workflow: developers write real copy first, the extractor reads those literals from source code, and the generated artifacts stay explicit and reviewable.

The goal is simple:

- Reduce development friction: write `<T text="Hello {name}" />` instead of inventing a key first.
- Keep production artifacts deterministic: locale JSON, source maps, and manifests are plain files.
- Let translation management move out of the code-editing loop through the local GUI.

For production projects, `hash` key mode is recommended. It keeps readable source text in code while using stable short keys in JSON files.

## Compared With Traditional i18n

| Area | Traditional i18n | Literal I18n |
| --- | --- | --- |
| Development entry | Name keys first, then call `t('home.title')` | Write `<T text="Home" />` or `tr('Home')` |
| Key management | Manual naming and folder conventions | AST-generated keys with `source` / `hash` modes |
| Missing translations | Usually runtime/build fallback or errors | Detected during extraction and can be translated by hooks |
| Repeated source text | Manually split keys | Use `id` to separate translation context |
| Runtime payload | Often loads the whole locale file | Can prune messages by current route through middleware/proxy + manifest |
| Translation management | External platform or manual JSON edits | Built-in local GUI for filtering, clearing, retranslating, and deleting AST-unused entries |
| Setup cost | Requires a key taxonomy | `npx literal-i18n init --yes` first |

Literal I18n is not trying to replace every large translation management system. It is for teams that want translation workflows to stay inside the repository while keeping the developer experience light.

## Development Examples

Use source copy directly in components:

```tsx
import { T } from 'literal-i18n';

export function UserLine({ name }: { name: string }) {
  return <T text="Hello {name}" name={name} />;
}
```

`<T />` placeholders can also receive React nodes, which is useful when one variable segment needs styling or a link:

```tsx
<T
  text="my name {name}"
  name={<span className="text-red-400">lili</span>}
/>
```

Get translated strings inside Client Components:

```tsx
'use client';

import { useTranslate } from 'literal-i18n';

export function SaveButton() {
  const { tr } = useTranslate();

  return <button>{tr('Save')}</button>;
}
```

Use translations on the server:

```ts
import { getLocaleTranslator } from 'literal-i18n/server';

export async function getTitle(locale: string) {
  const { tr } = await getLocaleTranslator(locale);

  return tr('Dashboard');
}
```

For Next.js App Router, inject the provider in the locale layout:

```tsx
import { I18nProvider } from 'literal-i18n';
import { getI18nProviderProps } from 'literal-i18n/server';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const i18n = await getI18nProviderProps(locale);

  return <I18nProvider {...i18n}>{children}</I18nProvider>;
}
```

Get the current locale:

```tsx
'use client';

import { useI18n, useTranslate } from 'literal-i18n';

export function LocaleBadge() {
  const { locale } = useI18n();
  const { locale: sameLocale, tr } = useTranslate();

  return <span title={sameLocale}>{tr('Current language')}: {locale}</span>;
}
```

In Server Components, the most explicit and stable source is App Router's `params.locale`; pass it to the server helper:

```tsx
import { getLocaleTranslator } from 'literal-i18n/server';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { tr } = await getLocaleTranslator(locale);

  return <h1>{tr('Dashboard')}</h1>;
}
```

If your middleware writes a locale header, `getTranslator()` can read the current request locale automatically. If no locale is available, it falls back to `en`:

```ts
import { getTranslator } from 'literal-i18n/server';

export async function getServerCopy() {
  const { locale, tr } = await getTranslator();

  return { locale, title: tr('Dashboard') };
}
```

Use `id` when the same source text needs different translations:

```tsx
<T text="Post" id="button" />
<T text="Post" id="noun" />
```

## GIF Preview

![Demo](docs/output.gif)

The GIF shows the basic development flow from source literals to generated translation files. In real projects, pair it with `literal-i18n gui` for translation management and runtime manifests for current-route payload control.

## Installation, CLI First

For new projects, start with the init command:

```bash
npx literal-i18n init --yes
```

Preview planned changes without writing files:

```bash
npx literal-i18n init --dry-run
```

Note: `npx literal-i18n init` without `--yes` only prints the plan and does not write files. The docs intentionally prefer `npx literal-i18n init --yes` to avoid a silent setup.

If you want to install the dependency first:

```bash
npm install literal-i18n
npx literal-i18n init --yes
```

With a project dependency, the bare `literal-i18n init` command is usually not available in the global shell PATH. Use `npx literal-i18n init --yes`, `npm exec literal-i18n -- init --yes`, or call it from `package.json` scripts.

`init` conservatively detects and creates or updates:

- `literal-i18n.config.ts`
- `src/messages/`
- `.env.example`
- `package.json` scripts: `i18n:extract`, `i18n:watch`, and `build`
- `src/middleware.ts` for Next.js 15, or `src/proxy.ts` for Next.js 16
- `src/app/api/literal-i18n/messages/route.ts` for route-level message supplements during client navigation
- simple `next.config.ts/mjs/js` wrapping with `withLiteralI18n(...)`

If the project already has `next.config`, `middleware`, or `proxy`, init does not blindly overwrite them. Simple configs are merged automatically; complex files get manual merge guidance. Re-running init does not insert duplicate blocks.

The generated config includes a default DeepSeek `translateJsonHook`. Without `LITERAL_I18N_API_KEY`, it extracts only and does not auto-translate. Once the key is present, missing target translations can be translated automatically.

```ts
import { defineLiteralI18nConfig } from 'literal-i18n/next';
import { createDeepSeekTranslateJsonHook } from 'literal-i18n/local-translate-api';

export default defineLiteralI18nConfig({
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  sourceMapOutput: 'src/messages/source-map.json',
  localeDir: 'src/messages',
  locales: ['en', 'zh'],
  sourceLocale: 'en',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
  async translateJsonHook(input) {
    const apiKey = process.env.LITERAL_I18N_API_KEY;
    if (!apiKey) return {};

    return createDeepSeekTranslateJsonHook({
      baseUrl: 'https://api.deepseek.com',
      apiKey,
      model: 'deepseek-v4-flash',
      batchSize: 20,
      timeoutMs: 120000,
      temperature: 0.1,
      prompt: 'Translate concise UI copy. Keep placeholders unchanged.',
    })(input);
  },
});
```

## GUI Translation Management

Start the local translation manager:

```bash
npx literal-i18n gui
```

Default URL:

```txt
http://127.0.0.1:3699
```

Custom port:

```bash
npx literal-i18n gui --port 3700
```

The GUI is for translation management rather than development setup. It reads the current project's `literal-i18n.config.*`, locale JSON files, `source-map.json`, `manifest.json`, and AST cache.

Current capabilities:

- Filter by page URL, source snippet, locale, key, and copy search. Copy search uses the selected locale's JSON value; for example, selecting `zh` searches Chinese translations, while selecting the source locale searches source copy.
- View readonly `source-map.json`.
- View and edit target locale JSON files such as `zh.json` or `de.json`.
- Clear a translation without deleting its key.
- Retranslate a single key.
- Show key:value entries that are no longer in the AST.
- Delete AST-unused entries.
- Prune extra key:value entries across source map and locale JSON files.

Deletion has strict boundaries: only keys missing from the latest AST scan can be deleted, and the server revalidates the AST cache before writing. If the AST cache is missing, deletion is disabled.

This direction is designed for a practical workflow: developers keep source copy and structure in code, while translators or reviewers can manage translations through a local link.

## More Details

### CLI Extraction

```bash
npx literal-i18n extract
```

The legacy command remains available:

```bash
npx literal-i18n-extract
```

Specify a config file:

```bash
npx literal-i18n extract --config ./literal-i18n.config.ts
```

Override options from the command line:

```bash
npx literal-i18n extract src \
  --out src/messages/en.json \
  --source-map-out src/messages/source-map.json \
  --key-mode hash \
  --id-prefix m_ \
  --id-length 16 \
  --locales en,zh,de \
  --source-locale en
```

Configuration priority:

```txt
CLI flags > NEXT_PUBLIC_LITERAL_I18N_* env vars > literal-i18n.config.* > defaults
```

Watch mode:

```bash
npx literal-i18n extract --watch
```

When `withLiteralI18n` is used, development mode starts the internal watcher by default. It scans once on startup and again on source changes. With explicit `next dev --webpack`, extraction uses the webpack watch hook by default; set `devWatch: true` if startup scanning is still required.

### Next.js Plugin

```ts
import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from './literal-i18n.config';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, literalI18nConfig);
```

Next.js 16 should use `src/proxy.ts`:

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { literalI18nMiddleware } from 'literal-i18n/middleware';

export function proxy(request: NextRequest) {
  return literalI18nMiddleware(request, NextResponse);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
```

Next.js 15 uses `src/middleware.ts`; the body is the same, but the exported function is usually named `middleware`:

```ts
export function middleware(request: NextRequest) {
  return literalI18nMiddleware(request, NextResponse);
}
```

The middleware/proxy only forwards the current pathname through a request header. It does not read JSON or translate. Message pruning happens inside `getI18nProviderProps(locale)`.

If your project has no other middleware, use `literalI18nMiddleware(request, NextResponse)` directly. You do not need to import `LITERAL_I18N_PATHNAME_HEADER` manually.

If the project already has next-intl or custom middleware, merge literal-i18n's pathname header into the same request. In this case, `LITERAL_I18N_PATHNAME_HEADER` is required:

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { LITERAL_I18N_PATHNAME_HEADER } from 'literal-i18n/middleware';

const intlMiddleware = createMiddleware({
  locales: ['en', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LITERAL_I18N_PATHNAME_HEADER, request.nextUrl.pathname);

  return intlMiddleware(
    new NextRequest(request, {
      headers: requestHeaders,
    }),
  );
}
```

If you have `_rsc`, static asset allowlists, rewrites, or any early-return branch, make sure page requests that need pruning do not bypass this header. Otherwise `getI18nProviderProps(locale)` cannot read pathname and will fall back to full messages.

### Current-Route Runtime Pruning

Extraction generates `src/messages/manifest.json`, which records App Router routes and the message keys used by each route.

By default, `getI18nProviderProps(locale)` returns only the messages needed by the route that matches the current pathname. Page A's initial HTML/RSC payload will not include translations from page B or page B/_components.

If `I18nProvider` lives in a persistent layout, a client navigation from page A to page B uses `/api/literal-i18n/messages?locale=zh&pathname=/zh/create` by default to supplement the current route messages and merge them into the existing provider state. This keeps the initial payload strictly pruned while avoiding source-text fallback after soft navigation.

`init` creates the default API route automatically. Existing projects can add it manually:

```ts
// src/app/api/literal-i18n/messages/route.ts
export { literalI18nMessagesGET as GET } from 'literal-i18n/server';
```

Use a custom loader when you need your own auth, cache, or gateway behavior:

```tsx
<I18nProvider
  {...i18n}
  loadMessages={(locale, pathname) =>
    fetch(`/custom/messages?locale=${locale}&pathname=${pathname}`).then((res) => res.json())
  }
>
  {children}
</I18nProvider>
```

If you only need to change the default endpoint, pass `messageEndpoint="/custom/messages"`.

`getI18nProviderProps(locale)` prunes messages through the manifest when:

- `manifest.json` exists.
- `literalI18nMiddleware` is installed.
- The current pathname matches a manifest route.

Missing middleware, missing manifest, unmatched routes, or invalid manifest data fall back to full messages. This fallback keeps pages working, but acceptance tests should inspect the actual HTML/RSC payload to ensure pruning is active.

Tests can pass pathname manually:

```ts
const i18n = await getI18nProviderProps('zh', {
  pathname: '/zh/about',
});
```

If `I18nProvider` lives in a persistent layout and you prefer same-locale client navigation to keep all keys available, opt into navigation-scoped payloads:

```ts
const i18n = await getI18nProviderProps('zh', {
  pathname: '/zh/about',
  payloadScope: 'navigation',
});
```

`payloadScope: 'navigation'` sends keys for other pages in the same locale navigation tree into the initial source. For strict pruning, keep the default `route` scope or place the provider behind a boundary that refreshes per page.

The full `source-map.json` is not sent to the client by default. Opt in explicitly if needed:

```ts
const i18n = await getI18nProviderProps('zh', {
  includeSourceMap: true,
});
```

### Hash Key Mode

The default `source` mode uses source text as keys:

```json
{
  "Hello World": "你好世界"
}
```

Production projects should usually use `hash`:

```json
{
  "m_073083b5b1d08690": "你好世界"
}
```

`source-map.json` records the source-to-key relationship:

```json
{
  "Hello World": "m_073083b5b1d08690"
}
```

The same source text with different `id` values produces different keys:

```tsx
<T text="Post" id="button" />
<T text="Post" id="noun" />
```

### AST Extraction Rules

Recognized imports by default:

```ts
import { T, useTranslate, createTranslator } from 'literal-i18n';
import { getTranslator, getLocaleTranslator } from 'literal-i18n/server';
```

Static literals are supported:

```tsx
<T text="Hello World" />
<T text="Post" id="button" />

const { tr } = useTranslate();
tr('Client text');
tr('Post', undefined, { id: 'button' });
```

Dynamic source text or dynamic ids are not supported:

```tsx
<T text={title} />
<T text={`Hello ${name}`} />
<T text="Post" id={type} />
tr(variable);
tr('Post', undefined, { id: type });
```

These patterns produce extraction warnings. The extractor must know the real source text at AST time to generate stable translation artifacts.

Configure custom import sources when wrapping the API:

```ts
export default withLiteralI18n(nextConfig, {
  importSources: ['literal-i18n', '@/components/i18n'],
});
```

### Translation Hooks

Batch translation is recommended:

```ts
export default withLiteralI18n(nextConfig, {
  locales: ['zh'],
  sourceLocale: 'en',
  async translateJsonHook({
    locale,
    sourceLocale,
    missingTexts,
    missingMessages,
  }) {
    return myTranslateBatch({
      locale,
      sourceLocale,
      texts: missingTexts,
      messages: missingMessages,
    });
  },
});
```

Return type:

```ts
Record<string, string>
```

Returned keys can be source text or generated message keys. For repeated source text with different `id` values, returning generated message keys is safer.

Single-message translation is also supported:

```ts
export default withLiteralI18n(nextConfig, {
  async translateHook({ text, key, id, locale, sourceLocale }) {
    return myTranslateOne({ text, key, id, locale, sourceLocale });
  },
});
```

`treatSourceAsMissing` defaults to `false`. A target translation that equals the source text is not treated as missing by default, which matters for Latin-script languages where identical text can be correct.

### Demos

Two demos are included:

```bash
cd demo
npm install
npm run dev
```

```bash
cd demo-next-16
npm install
npm run dev
```

The demos require your own DeepSeek API key for auto-translation:

```env
LITERAL_I18N_API_KEY=your-api-key
```

In Next.js 16 / Turbopack, translation file updates may require a manual page refresh.

## API Reference

### `literal-i18n`

- `T`
- `I18nProvider`
- `useTranslate()`: returns `{ locale, tr }`.
- `useI18n()`: returns `{ locale, translate }`.
- `loadMessages(locale, pathname)`: default client route supplement loader, requesting `/api/literal-i18n/messages`.
- `DEFAULT_MESSAGE_ENDPOINT`
- `createTranslator(options)`
- `createMessageId(text, options)`
- `getMessageKey(text, options)`
- `getEnvMessageIdOptions()`
- `defaultTranslate`

### `literal-i18n/server`

- `loadMessages(locale, localeDir?)`
- `loadSourceMap(localeDir?)`
- `loadLiteralI18nManifest(localeDir?)`
- `loadLiteralI18nConfig(cwd?)`
- `getMessageStore(localeDir?)`
- `getI18nProviderProps(locale, options?)`
- `literalI18nMessagesGET(request)`: default Next.js route handler; use `export { literalI18nMessagesGET as GET } from 'literal-i18n/server'`.
- `getTranslator(input?)`: returns `{ locale, messages, tr }`; without an explicit locale, it tries to read the request header.
- `getLocaleTranslator(locale, options?)`: returns `{ locale, messages, tr }`.

Common options for `getI18nProviderProps` / `getTranslator` / `getLocaleTranslator`:

- `localeDir`: message directory, default `src/messages`.
- `sourceMap`: manually provided source map.
- `includeSourceMap`: only for `getI18nProviderProps`, default `false`.
- `optimizePayload`: only for `getI18nProviderProps`, default `true`.
- `payloadScope`: only for `getI18nProviderProps`, default `route`; set `navigation` for same-locale navigation-scoped payloads.
- `pathname`: only for `getI18nProviderProps`, normally provided by middleware/proxy.
- `keyMode` / `idPrefix` / `idLength`: hash key options, usually loaded from config.

### `literal-i18n/client-loader`

- `loadMessages(locale, pathname)`: default client route supplement request.
- `loadMessagesFromEndpoint(locale, pathname, endpoint)`: request a custom endpoint.
- `normalizeLoadedMessages(payload)`: read mergeable messages from either `{ messages }` or a direct messages object.
- `DEFAULT_MESSAGE_ENDPOINT`

### `literal-i18n/middleware`

- `literalI18nMiddleware(request, NextResponse)`
- `LITERAL_I18N_PATHNAME_HEADER`

### `literal-i18n/next`

- `withLiteralI18n(nextConfig, options)`
- `defineLiteralI18nConfig(options)`
- `LiteralI18nNextPlugin`

Common options:

- `sourceDir` / `sourceDirs`
- `sourceOutput`
- `sourceMapOutput`
- `manifestOutput`
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

`devWatch`:

- `true`: force the internal development watcher.
- `false`: disable automatic development extraction; run CLI or `extract --watch` manually.
- unset: internal watcher by default; explicit `next dev --webpack` uses webpack watch.

### `literal-i18n/local-translate-api`

- `createLocalTranslateJsonHook(options)`
- `createOpenAICompatibleTranslateJsonHook(options)`
- `createDeepSeekTranslateJsonHook(options)`

These helpers are optional. You can use DeepSeek, any OpenAI-compatible API, your own service, or a fully custom translation hook.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

Highlights in `0.2.6`:

- Restored strict current-route pruning for the initial payload, so page A does not include page B or page B/_components copy.
- Added client route message supplements: persistent `I18nProvider` instances load and merge messages for the current pathname after soft navigation.
- Added the default `/api/literal-i18n/messages` route handler, `literal-i18n/client-loader`, and automatic API route generation in `init`.

## Questions And Issues

Please submit bugs, feature requests, or usage questions through GitHub Issues:

https://github.com/gguser1995-spec/literal-i18n/issues

Helpful issue details:

- `literal-i18n` version.
- Next.js / React versions.
- `literal-i18n.config.*`.
- Related page path.
- Relevant snippets from locale JSON, `source-map.json`, and `manifest.json`.
- For payload issues, include the message keys that appear in the actual HTML/RSC payload.
