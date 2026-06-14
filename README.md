# Literal I18n

Literal I18n 是一个“直接用原文作为翻译源”的 React / Next.js 国际化工具。

你不需要维护 `home.title` 这类 key：

```tsx
import { T } from 'literal-i18n';

<T text="Hello {name}" name={user.name} />
```

抽取器会从源码里收集静态原文，生成 JSON，再通过你提供的异步翻译函数补齐目标语言。

## 核心理念

- 组件里用 `<T />`。
- 客户端组件函数里用 `useTranslate()`。
- 服务端请求里用 `getLocaleTranslator(locale)` 或 `getTranslator()`。
- 非组件环境里显式用 `createTranslator({ locale, messages })`。
- 异步翻译只发生在抽取/生成 JSON 阶段，不发生在页面渲染阶段。

## 安装

```bash
npm install literal-i18n
```

## React 组件

```tsx
import { T } from 'literal-i18n';

<T text="Hello World" />
<T text="Hello {name}" name={user.name} />
```

`<T />` 支持 ReactNode 插值：

```tsx
<T
  text="my name is {name}"
  name={<span className="text-red-500">Tom</span>}
/>
```

翻译后的文案可以调整占位符位置，只要保留 `{name}` 即可。

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

`useTranslate()` 读取最近的 `I18nProvider`，所以能拿到当前 locale 对应的 messages。

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

`useTranslate()`、`getTranslator()`、`getLocaleTranslator()` 解构出来的 `tr`，以及 `createTranslator()` 返回的本地函数，都会被 AST 识别。

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

## Provider

```tsx
import { I18nProvider } from 'literal-i18n';

<I18nProvider locale={locale} messages={messages}>
  {children}
</I18nProvider>
```

`messages` 是扁平 JSON：

```json
{
  "Hello {name}": "你好 {name}"
}
```

`I18nProvider` 也支持 hash key 模式：

```tsx
<I18nProvider
  locale={locale}
  messages={messages}
  keyMode="hash"
  idPrefix="m_"
  idLength={16}
>
  {children}
</I18nProvider>
```

## Next.js 插件

```ts
import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, {
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  localeDir: 'src/messages',
  locales: ['en', 'zh', 'ja'],
  sourceLocale: 'en',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
  async translateJsonHook({ locale, sourceLocale, missingTexts }) {
    return await translateMissingTexts({
      locale,
      sourceLocale,
      texts: missingTexts,
    });
  },
});
```

如果你使用多个 Next 插件，可以组合：

```ts
export default withOtherPlugin(
  withLiteralI18n(nextConfig, literalI18nOptions),
);
```

## 配置语言和输出目录

```ts
withLiteralI18n(nextConfig, {
  sourceOutput: 'src/messages/en.json',
  localeDir: 'src/messages',
  locales: ['en', 'de', 'zh'],
  sourceLocale: 'en',
});
```

会维护：

```txt
src/messages/en.json
src/messages/de.json
src/messages/zh.json
```

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

配置：

```env
NEXT_PUBLIC_LITERAL_I18N_KEY_MODE=hash
NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX=m_
NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH=16
```

`sourceMapOutput` 是可选的。hash 模式下它可以输出 `原文 -> hash key`，方便排查：

```ts
sourceMapOutput: 'src/messages/source-map.json'
```

source 模式基本不需要 `sourceMapOutput`，因为 key 本身就是原文。

## AST 抽取规则

默认只识别来自这些模块的 API：

```ts
import { T, useTranslate, createTranslator } from 'literal-i18n';
import { getTranslator, getLocaleTranslator } from 'literal-i18n/server';
```

支持：

```tsx
<T text="Hello World" />
<T text="Hello {name}" name={user.name} />
```

```tsx
const { tr } = useTranslate();
tr('Client text');
```

```ts
const { tr } = await getLocaleTranslator(locale);
tr('Server text');
```

```ts
const t = createTranslator({ locale, messages });
t('Dictionary text');
```

不支持动态原文：

```tsx
<T text={title} />
<T text={`Hello ${name}`} />
t(variable)
t(getTitle())
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
  async translateJsonHook({ locale, sourceLocale, missingTexts }) {
    return await myTranslateBatch({
      locale,
      sourceLocale,
      texts: missingTexts,
    });
  },
});
```

返回值是：

```ts
Record<string, string>
```

key 是原文，value 是译文。

### `translateHook`

也可以逐条翻译：

```ts
withLiteralI18n(nextConfig, {
  async translateHook({ text, locale, sourceLocale }) {
    return await myTranslateOne({ text, locale, sourceLocale });
  },
});
```

## 可选翻译 Helper

包里提供了几个 helper，方便快速接入已有服务。它们只是可选方案，不是必须使用。

```ts
import { createOpenAICompatibleTranslateJsonHook } from 'literal-i18n/local-translate-api';

createOpenAICompatibleTranslateJsonHook({
  baseUrl: process.env.TRANSLATE_API_BASE_URL!,
  apiKey: process.env.TRANSLATE_API_KEY!,
  model: process.env.TRANSLATE_MODEL!,
  prompt: 'Translate concise UI copy.',
});
```

```ts
import { createLocalTranslateJsonHook } from 'literal-i18n/local-translate-api';

createLocalTranslateJsonHook({
  endpoint: process.env.TRANSLATE_API_ENDPOINT!,
  prompt: 'Translate concise UI copy.',
});
```

文档不假设你使用某个具体本地服务或某个具体模型。你可以接 DeepSeek、OpenAI-compatible API、自建服务，或者完全自己实现。

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
