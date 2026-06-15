# Literal I18n

[中文](https://gitee.com/lwfux/literal-i18n/blob/master/docs/literal-i18n.md) | [English](https://gitee.com/lwfux/literal-i18n/blob/master/docs/literal-i18n.en.md)

Literal I18n 是一个“直接用原文作为翻译源”的 React / Next.js 国际化工具。

你不需要先维护 `home.title` 这类 key：

```tsx
import { T } from 'literal-i18n';

<T text="Hello {name}" name={user.name} />
```

抽取器会从源码里收集静态原文，生成 JSON，再通过你提供的异步翻译函数补齐目标语言。

## 你需要先准备什么

接入前先确定这几件事：

- 源语言：例如 `en`
- 目标语言：例如 `zh`、`de`、`ja`
- JSON 输出目录：例如 `src/messages`
- key 模式：`source` 或 `hash`
- 翻译方式：自己实现 `translateJsonHook`，或使用包里可选的 OpenAI-compatible helper

推荐生产项目使用 hash key。你可以把这些值写在 `literal-i18n.config.mjs` 里；如果运行时也需要从环境读取，再同步到 `.env`：

```env
NEXT_PUBLIC_LITERAL_I18N_KEY_MODE=hash
NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX=m_
NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH=16
```

## 安装

```bash
npm install literal-i18n
```

建议先建一个独立配置文件，让 Next 插件和 CLI 共用同一份配置：

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
    // translateMissingTexts 可自行实现；
    return await translateMissingTexts(input);
    // 另外包内提供可选，例子：
    // const apiKey = process.env.LITERAL_I18N_API_KEY;
    // if (!apiKey) return {};
    // const hook = createDeepSeekTranslateJsonHook({
    //   baseUrl: 'https://api.deepseek.com',
    //   apiKey,
    //   model: 'deepseek-v4-flash',
    //   batchSize: 20,
    //   timeoutMs: 120000,
    //   temperature: 0.1,
    //   prompt: '你是一位专业的网站 UI 本地化翻译人员。保持译文简洁自然。保留所有占位符不变。',
    // });
    // return hook(input);
  },
});
```

CLI 会默认读取项目根目录下的 `literal-i18n.config.mjs`、`.js`、`.cjs`、`.ts` 或 `.json`。

如果你使用 Next.js 16 或 Turbopack，建议显式准备抽取脚本：

```json
{
  "scripts": {
    "i18n:extract": "literal-i18n-extract",
    "i18n:watch": "literal-i18n-extract --watch",
    "build": "npm run i18n:extract && next build"
  }
}
```

这段 `i18n:extract` 不是所有项目都必须配置：

- 使用 `withLiteralI18n` 且走 webpack 编译时，Next 插件会在 dev/watch/build 阶段自动抽取。
- 使用 Next.js 16 / Turbopack dev 时，`withLiteralI18n` 会自动启动一个内置 dev watcher，不需要 `--webpack`。
- 使用 Next.js 16 / Turbopack build 时，建议配置 `i18n:extract`，并在 `build` 前先执行它。
- 不使用 Next 插件，或在非 Next 项目里使用时，需要通过 CLI 手动抽取。

如果你不想让 Next 插件启动内置 watcher，可以关闭它：

```ts
export default withLiteralI18n(nextConfig, {
  ...literalI18nConfig,
  devWatch: false,
});
```

## 配置 next.config.ts

```ts
import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from './literal-i18n.config.mjs';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, literalI18nConfig);
```

会维护这些文件：

```txt
src/messages/en.json
src/messages/zh.json
src/messages/de.json
src/messages/source-map.json
```

如果你使用多个 Next 插件，可以组合：

```ts
export default withOtherPlugin(
  withLiteralI18n(nextConfig, literalI18nOptions),
);
```

### Next.js 16 和 Turbopack

`withLiteralI18n` 会在检测到宿主项目使用 Next.js 16 且没有配置 `turbopack` 时，自动补一个空的 `turbopack: {}`，避免 Next.js 因为同时看到 webpack config 和 Turbopack build 而报错。

Turbopack dev 模式下，webpack hook 不会执行，所以 `withLiteralI18n` 会自动启动一个独立 dev watcher，负责初次扫描和源码变化后的增量抽取。

Turbopack build 模式下，仍然建议在 `next build` 前显式运行 CLI：

```bash
npm run i18n:extract && next build
```

如果你希望继续使用 webpack hook 在构建阶段自动抽取，可以使用 webpack 构建：

```bash
next build --webpack
```

## CLI 抽取

默认用法：

```bash
literal-i18n-extract
```

它会自动读取项目根目录里的 `literal-i18n.config.*`。如果你需要指定配置文件：

```bash
literal-i18n-extract --config ./configs/i18n.mjs
```

也可以用参数临时覆盖配置：

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

配置优先级：

```txt
命令行参数 > NEXT_PUBLIC_LITERAL_I18N_* 环境变量 > literal-i18n.config.* > 默认值
```

支持 watch 模式：

```bash
literal-i18n-extract --watch
```

`--watch` 适合你没有使用 Next 插件，或主动设置了 `devWatch: false` 的场景。默认情况下，Turbopack dev 会由 `withLiteralI18n` 自动启动内置 watcher。

## 配置 I18nProvider

在 App Router 中，通常在 locale layout 里加载当前语言 JSON：

```tsx
import { I18nProvider } from 'literal-i18n';
import { loadMessages } from 'literal-i18n/server';

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  const messages = await loadMessages(locale);

  return (
    <I18nProvider
      locale={locale}
      messages={messages}
      keyMode="hash"
      idPrefix="m_"
      idLength={16}
    >
      {children}
    </I18nProvider>
  );
}
```

`messages` 是扁平 JSON：

```json
{
  "m_073083b5b1d08690": "你好世界"
}
```

`loadMessages` 的第二个参数可以自定义语言文件目录：

```ts
const messages = await loadMessages(locale, 'locales');
```

如果你的 locale 来自 route params，例如 `/en`、`/zh`，不同语言通常会进入不同路由，适合 SSG/SSR。

如果你的 locale 来自 cookie、header 或 middleware/proxy，并且希望每次请求都按用户状态切换语言，需要让 Next 页面保持动态渲染：

```ts
import { headers } from 'next/headers';

export default async function LocaleLayout({ children }) {
  await headers(); // force dynamic when locale depends on request state

  return children;
}
```

否则 Next 可能把页面静态化，导致构建时读取的 messages 被固化。

## 组件内使用

```tsx
import { T } from 'literal-i18n';

<T text="Hello World" />
<T text="Hello {name}" name={user.name} />
```

除了 `text`、`id`、`params` 之外，传给 `<T />` 的其他 props 都会作为插值参数：

```tsx
<T text="my name is {name}" name="wang huahua" />
```

等价于：

```tsx
<T
  text="my name is {name}"
  params={{ name: 'wang huahua' }}
/>
```

`<T />` 支持 ReactNode 插值：

```tsx
<T
  text="my name is {name}"
  name={<span className="text-red-500">Tom</span>}
/>
```

在 Next.js App Router 中，如果你给 `<T />` 传 ReactNode 插值，例如 `<span />`，建议把这段使用放在 client component 里：

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

Server Component 中建议只传字符串、数字这类普通参数。ReactNode 从 Server Component 传给 Client Component prop 时，容易遇到 Next.js 序列化和 hydration 边界问题。

## 客户端组件函数

如果你需要在 client component 里得到字符串，而不是直接渲染 `<T />`，使用 `useTranslate()`：

```tsx
'use client';

import { useTranslate } from 'literal-i18n';

export function Title() {
  const { tr } = useTranslate();

  return <h1>{tr('I am a test')}</h1>;
}
```

支持给 `tr` 起别名，AST 也能识别：

```tsx
const { tr: t } = useTranslate();

t('Client text');
```

## Next.js 服务端

如果你已经有路由里的 `locale`：

```ts
import { getLocaleTranslator } from 'literal-i18n/server';

const { tr } = await getLocaleTranslator(locale);

tr('Hello {name}', { name: user.name });
```

如果你希望从 Next request header 推断 locale：

```ts
import { getTranslator } from 'literal-i18n/server';

const { tr } = await getTranslator();

tr('Server rendered text');
```

## 非组件环境

非组件环境不要依赖全局状态。请显式创建 translator：

```ts
import { createTranslator } from 'literal-i18n';

const t = createTranslator({
  locale,
  messages,
  keyMode: 'hash',
});

t('Hello {name}', { name: 'Tom' });
```

## 用 id 区分相同原文的不同语境

同一句英文在不同场景可能需要不同翻译，比如 `Post` 可以是“发布”，也可以是“帖子”。可以给 `<T />` 或 `tr()` 加 `id`：

```tsx
<T text="Post" id="button" />
<T text="Post" id="noun" />
```

```ts
const { tr } = useTranslate();

tr('Post', undefined, { id: 'button' });
tr('Post', undefined, { id: 'noun' });
```

source 模式会生成：

```json
{
  "Post_button": "发布",
  "Post_noun": "帖子"
}
```

hash 模式会把 `text + id` 一起生成稳定 hash：

```json
{
  "m_xxxx": "发布",
  "m_yyyy": "帖子"
}
```

`id` 只用于区分翻译语境，不会作为插值参数。如果你需要插值 `{id}`，请使用 `params`：

```tsx
<T text="ID is {id}" params={{ id: userId }} />
```

## AST 抽取规则

默认只识别来自这些模块的 API：

```ts
import { T, useTranslate, createTranslator } from 'literal-i18n';
import { getTranslator, getLocaleTranslator } from 'literal-i18n/server';
```

支持：

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

不支持动态原文或动态 id：

```tsx
<T text={title} />
<T text={`Hello ${name}`} />
<T text="Post" id={type} />
tr(variable)
tr(getTitle())
tr('Post', undefined, { id: type })
```

这些写法会在扫描时输出 warning。

如果你封装了自己的入口，可以配置：

```ts
withLiteralI18n(nextConfig, {
  importSources: ['literal-i18n', '@/components/i18n'],
});
```

## 翻译生成 Hook

真正的异步翻译应该发生在抽取/生成 JSON 阶段。运行时只同步读取 JSON。

推荐你自己实现 `translateJsonHook` 或 `translateHook`，把业务术语、缓存、重试、审校、日志接进去。

### `translateJsonHook`

推荐批量翻译缺失文案：

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

返回值是：

```ts
Record<string, string>
```

key 可以是原文，也可以是生成后的 message key。对于带 `id` 的相同原文，推荐返回生成后的 message key，避免不同语境互相覆盖。

### `translateHook`

也可以逐条翻译：

```ts
withLiteralI18n(nextConfig, {
  async translateHook({ text, key, id, locale, sourceLocale }) {
    return await myTranslateOne({ text, key, id, locale, sourceLocale });
  },
});
```

## 可选翻译 Helper

包里提供了几个 helper，方便快速接入已有服务。它们只是可选方案，不是必须使用，可自行编写。

> **⚠️ 说明**: `createOpenAICompatibleTranslateJsonHook` 已导出但尚未经过充分测试。目前推荐使用 `createDeepSeekTranslateJsonHook`（底层同样是 OpenAI-compatible 调用，已验证可用）。

```ts
import { createOpenAICompatibleTranslateJsonHook } from 'literal-i18n/local-translate-api';

const translateJsonHook = createOpenAICompatibleTranslateJsonHook({
  baseUrl: process.env.TRANSLATE_API_BASE_URL!,
  apiKey: process.env.TRANSLATE_API_KEY!,
  model: process.env.TRANSLATE_MODEL!,
  prompt: 'Translate concise UI copy.',
});
```

如果你需要包装 helper，请把 input 原样传入：

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

文档不假设你使用某个具体本地服务或某个具体模型。你可以接 DeepSeek、OpenAI-compatible API、自建服务，或者完全自己实现。

> **💡 推荐**: 使用 DeepSeek 时，建议将 model 设为 `deepseek-v4-flash`，兼顾翻译质量和响应速度。`deepseek-chat` 在大量短文本翻译场景下可能不如 `deepseek-v4-flash` 高效。

## Hash Key 模式

默认 `source` 模式会把原文直接作为 key：

```json
{
  "Hello World": "你好世界"
}
```

开启 hash 模式后：

```json
{
  "m_073083b5b1d08690": "你好世界"
}
```

`sourceMapOutput` 是可选的。hash 模式下它可以输出 `原文 -> hash key`，方便排查：

```ts
sourceMapOutput: 'src/messages/source-map.json'
```

带 `id` 的 source map key 会显示为 `原文_id`：

```json
{
  "Post_button": "m_xxxx",
  "Post_noun": "m_yyyy"
}
```

source 模式基本不需要 `sourceMapOutput`，因为 key 本身就是原文。

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
- `getTranslator(input?)`
- `getLocaleTranslator(locale, options?)`

### `literal-i18n/next`

- `withLiteralI18n(nextConfig, options)`
- `LiteralI18nNextPlugin`

常用 options：

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

### `literal-i18n/local-translate-api`

- `createLocalTranslateJsonHook(options)`
- `createOpenAICompatibleTranslateJsonHook(options)`
- `createDeepSeekTranslateJsonHook(options)`
