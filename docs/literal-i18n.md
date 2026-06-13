# Literal I18n 使用文档

Literal I18n 是一个“原文即 key”的 React/Next.js 国际化方案。

你不需要维护 `home.title` 这类 key：

```tsx
import { T } from 'literal-i18n';

<T text="Hello {name}" name={user.name} />
```

`<T />` 支持 ReactNode 插值：

```tsx
<T
  text="my name is {aa}"
  aa={<span className="text-red-500">22</span>}
/>
```

翻译后的文案也可以调整占位符位置，只要保留 `{aa}` 即可。

服务端请求级翻译：

```ts
import { getTranslator } from 'literal-i18n/server';

const tr = await getTranslator();

tr('Hello {name}', { name: user.name });
```

如果你已经有路由里的 `locale`，可以一步创建当前语言 translator：

```ts
import { getLocaleTranslator } from 'literal-i18n/server';

const { tr } = await getLocaleTranslator(locale);

tr('Hello {name}', { name: user.name });
```

`getTranslator()`、`getLocaleTranslator()` 和 `createTranslator()` 返回的本地 translator 变量也会被 AST 识别，所以不需要再额外写一条抽取标记。`getLocaleTranslator()` 也支持显式改名：

```ts
const { tr: t } = await getLocaleTranslator(locale);

t('Hello {name}', { name: user.name });
```

如果你不在 React 组件里，推荐显式创建 request-scoped translator，而不是直接使用全局 `tr`。全局 `tr` 不会自动知道当前 locale；在 Next.js 这类并发请求环境里，当前语言应该来自当前 request、route params 或你自己的上下文。

## Next.js 接入

在 `next.config.ts` 中包一层插件：

```ts
import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import { createLocalTranslateJsonHook } from 'literal-i18n/local-translate-api';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, {
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  sourceMapOutput: 'src/messages/source-map.json',
  localeDir: 'src/messages',
  locales: ['de', 'es', 'fr', 'it', 'pt', 'ru', 'ko', 'ja', 'zh', 'zh-CN', 'zh-TW'],
  sourceLocale: 'en',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
  translateJsonHook: createLocalTranslateJsonHook({
    endpoint: process.env.LITERAL_I18N_LOCAL_TRANSLATE_ENDPOINT!,
    batchSize: 20,
    timeoutMs: 120000,
    prompt: '你是网站 UI 本地化翻译，语气简洁自然。',
  }),
});
```

如果你还用了其他 Next 插件，可以组合：

```ts
export default withNextIntl(
  withLiteralI18n(nextConfig, {
    sourceDir: 'src',
    sourceOutput: 'src/messages/en.json',
    sourceMapOutput: 'src/messages/source-map.json',
    localeDir: 'src/messages',
    locales: ['de', 'es', 'fr', 'it', 'pt', 'ru', 'ko', 'ja', 'zh', 'zh-CN', 'zh-TW'],
    sourceLocale: 'en',
    keyMode: 'hash',
    idPrefix: 'm_',
    idLength: 16,
    translateJsonHook: createLocalTranslateJsonHook({
      endpoint: process.env.LITERAL_I18N_LOCAL_TRANSLATE_ENDPOINT!,
      batchSize: 20,
      timeoutMs: 120000,
      prompt: '你是网站 UI 本地化翻译，语气简洁自然。',
    }),
  }),
);
```

## 扫描时机

开发环境：

- Next watch 启动时全量扫描一次。
- 后续新增、修改、删除文件时，只扫描发生变化的文件。
- 增量扫描结果会缓存到 `.next/cache/literal-i18n/extracted-by-file.json`。

打包环境：

- `next build` 前会全量扫描一次。
- 全量扫描会重建 source 文件，保证构建产物使用最新文案。

也可以手动执行：

```bash
npm run i18n:extract
```

默认输出：

```txt
src/messages/en.json
src/messages/source-map.json
```

## Hash Key 模式

默认的 source 模式会把原文直接作为 JSON key：

```json
{
  "Hello World": "你好世界"
}
```

开启 hash 模式后，运行时和抽取插件都会用同一套规则从原文生成稳定 id：

```json
{
  "m_c3573d58ca714563": "你好世界"
}
```

配置：

```env
NEXT_PUBLIC_LITERAL_I18N_KEY_MODE=hash
NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX=m_
NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH=16
```

Hash 规则不包含密钥，可以只维护 `NEXT_PUBLIC_LITERAL_I18N_*` 这一套；Next 插件、服务端 translator 和客户端 `<T />` 都读取同一组配置。抽取时会额外写入 `source-map.json`：

```json
{
  "Hello World": "m_c3573d58ca714563"
}
```

这个 map 只是为了排查和迁移，运行时不会读取它。切换到 hash 模式时，插件会优先复用旧的原文 key 翻译，不会把已经存在的翻译重新翻译一遍。不同原文如果生成了相同 id，抽取会直接报错；可以提高 `NEXT_PUBLIC_LITERAL_I18N_ID_LENGTH` 或调整 `NEXT_PUBLIC_LITERAL_I18N_ID_PREFIX` 后重试。

## AST 识别规则

只识别来自配置 import source 的具名导入，默认是 `literal-i18n`：

```ts
import { T, tr } from 'literal-i18n';
```

支持 alias：

```ts
import { tr as translator } from 'literal-i18n';

translator('Welcome back');
```

支持：

```tsx
<T text="Hello World" />
<T text="Hello {name}" name={user.name} />
tr('Hello World')
tr('Hello {name}', { name })
const tr = await getTranslator()
tr('Server rendered text')
const { tr: localeTr } = await getLocaleTranslator(locale)
localeTr('Locale rendered text')
const dictionaryTr = createTranslator({ locale, messages })
dictionaryTr('Dictionary text')
```

不支持动态原文：

```tsx
<T text={title} />
<T text={`Hello ${name}`} />
tr(variable)
tr(getTitle())
```

这些写法会在扫描时输出 warning。

## 运行时 Provider

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

## API Reference

### `literal-i18n`

`T`

React 组件，适合组件树内使用。`text` 必须是静态字符串，其他 props 会作为占位符参数。

```tsx
<T text="Hello {name}" name={user.name} />
<T text="my name is {aa}" aa={<span>Tom</span>} />
```

`I18nProvider`

向组件树注入当前语言和消息字典。`messages` 是扁平 JSON。`translate` 可选，传入后会完全接管运行时翻译逻辑。

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

`useTranslate()` / `useI18n()`

在组件中读取当前 provider 的翻译函数或完整上下文。

`createTranslator(options)`

显式创建 translator，适合非组件环境、服务端工具函数、metadata、route handler 或测试。

```ts
import { createTranslator } from 'literal-i18n';

const tr = createTranslator({
  locale,
  messages,
  keyMode: 'hash',
});

tr('Hello {name}', { name: 'Tom' });
```

`tr(text, params?, locale?)`

全局 hook 的调用入口。它不会自动加载 messages，也不会自动获取当前 locale。只有当你调用过 `setTranslateHook(...)` 时，它才会使用你注册的全局翻译实现；否则只做原文 fallback 和参数替换。

```ts
import { setTranslateHook } from 'literal-i18n';

setTranslateHook((text, params, locale) => {
  return myTranslate(text, locale, params);
});
```

在 Next.js request-scoped 场景里，更推荐 `getTranslator()`、`getLocaleTranslator()` 或 `createTranslator()`，避免全局状态串请求。

`setTranslateHook(hook)` / `resetTranslateHook()`

注册或重置全局翻译 hook。适合 CLI、单例脚本、测试环境，谨慎用于服务端并发请求。

`createMessageId(text, options)` / `getMessageKey(text, options)` / `getEnvMessageIdOptions()`

用于 hash key 模式。`getMessageKey` 在 `keyMode: 'hash'` 时返回稳定 id，在 `source` 模式下返回原文。

### `literal-i18n/server`

`loadMessages(locale, localeDir?)`

从 `${localeDir}/${locale}.json` 读取扁平消息字典。默认目录是 `src/messages`。

`getTranslator(input?)`

创建服务端 translator。未传 `locale` 时，会尝试读取 Next 的 `X-NEXT-INTL-LOCALE` header。

```ts
const tr = await getTranslator();
tr('Server title');
```

`getLocaleTranslator(locale, options?)`

当你已经有 locale 时使用。返回 `{ locale, messages, tr }`。

```ts
const { tr } = await getLocaleTranslator(locale);
tr('Hello {name}', { name: 'Tom' });
```

### `literal-i18n/next`

`withLiteralI18n(nextConfig, options)`

Next.js webpack 插件包装器。常用 options：

- `sourceDir` / `sourceDirs`：扫描目录，默认 `src`。
- `sourceOutput`：源语言 JSON 输出路径，默认 `src/messages/en.json`。
- `sourceMapOutput`：原文到 key 的 map 输出路径。
- `localeDir`：目标语言 JSON 目录，默认 `src/messages`。
- `locales`：需要维护的语言列表。
- `sourceLocale`：源语言，默认 `en`。
- `keyMode` / `idPrefix` / `idLength`：key 生成策略。
- `importSources` / `serverImportSources`：AST 识别的 import source。
- `translateHook`：逐条翻译缺失文案。
- `translateJsonHook`：批量翻译缺失文案，推荐。
- `onExtract`：抽取完成后的回调。
- `keepStale`：是否保留已不再出现的旧文案，默认 `true`。
- `treatSourceAsMissing`：目标语言值等于原文时是否视为缺失，默认 `true`。
- `pruneLegacySourceKeys`：hash 模式迁移时是否清理旧原文 key，默认 `true`。
- `progress` / `silent`：日志输出控制。

### `literal-i18n/local-translate-api`

这些 helper 只是现成实现，方便你快速接本地或在线翻译服务。更推荐的长期方式是按你的业务、术语表、缓存、重试、审校流程自己实现 `translateJsonHook` 或 `translateHook`。

`createLocalTranslateJsonHook(options)`

对接本地 REST 翻译 API。必须显式传 `endpoint`。

```ts
createLocalTranslateJsonHook({
  endpoint: process.env.LITERAL_I18N_LOCAL_TRANSLATE_ENDPOINT!,
  batchSize: 20,
  timeoutMs: 120000,
  prompt: 'Translate concise UI copy.',
});
```

`createOpenAICompatibleTranslateJsonHook(options)`

对接 OpenAI-compatible Chat Completions API。必须显式传 `baseUrl`、`apiKey` 和 `model`。

`createDeepSeekTranslateJsonHook(options)`

`createOpenAICompatibleTranslateJsonHook` 的命名别名，不内置 baseUrl 或 model。

## 自定义运行时翻译

可以通过 `translate` 注入自己的运行时翻译逻辑：

```tsx
<I18nProvider
  locale="zh"
  translate={(text, params, locale) => {
    return myRuntimeTranslate(text, locale, params);
  }}
>
  {children}
</I18nProvider>
```

也可以在非 React 环境注册全局 hook：

```ts
import { setTranslateHook } from 'literal-i18n';

setTranslateHook((text, params, locale) => {
  return myRuntimeTranslate(text, locale, params);
});
```

注意：全局 hook 不会自动绑定请求 locale。服务端请求内请优先使用 request-scoped translator。

## 翻译生成 Hook

Next 插件支持两种翻译生成 hook。

翻译服务地址、在线 API 地址和模型名都需要显式配置；库不会内置 provider 默认值。

推荐你优先实现自己的翻译函数，把术语表、缓存、重试、人工审校和日志接进来。你不想自己写时，也可以使用包内置的两个 helper：

- `local`：本地 llama 翻译 API。
- `deepseek`：DeepSeek 或其他兼容 OpenAI ChatCompletions 的在线 API。

通过环境变量选择：

```env
LITERAL_I18N_TRANSLATE_PROVIDER=deepseek
DEEPSEEK_BASE_URL=<your-openai-compatible-base-url>
DEEPSEEK_MODEL=<your-model-name>
DEEPSEEK_API_KEY=<your-api-key>
LITERAL_I18N_TRANSLATE_BATCH_SIZE=20
LITERAL_I18N_TRANSLATE_TIMEOUT_MS=120000
```

模型名由服务商决定，例如：

```env
DEEPSEEK_MODEL=deepseek-v4-pro
```

如果使用本地翻译 API，开发或构建前启动服务：

```bash
node api-server.js
```

插件会调用：

```txt
POST ${LITERAL_I18N_LOCAL_TRANSLATE_ENDPOINT}/translate/batch
```

DeepSeek provider 会调用：

```txt
POST ${DEEPSEEK_BASE_URL}/chat/completions
```

如果服务没有启动，插件会保留原文 fallback。因为 `treatSourceAsMissing` 默认开启，目标语言文件里和原文相同的值下次仍会继续被视为未翻译。

### 单条文本 hook

适合逐条调用 AI 翻译接口：

```ts
export default withLiteralI18n(nextConfig, {
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  locales: ['zh', 'ja', 'ko'],
  sourceLocale: 'en',
  async translateHook({ text, locale }) {
    return await translateByAI(text, locale);
  },
});
```

插件会把返回值写入：

```txt
src/messages/zh.json
src/messages/ja.json
src/messages/ko.json
```

### 整份 JSON hook

适合一次性把缺失文案交给 AI，返回翻译后的 JSON：

```ts
export default withLiteralI18n(nextConfig, {
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  locales: ['zh'],
  sourceLocale: 'en',
  async translateJsonHook({ locale, sourceMessages, existingMessages, missingTexts }) {
    const translated = await translateJsonByAI({
      locale,
      texts: missingTexts,
    });

    return {
      ...existingMessages,
      ...translated,
    };
  },
});
```

`translateJsonHook` 的入参：

```ts
{
  locale: string;
  sourceLocale: string;
  sourceMessages: Record<string, string>;
  existingMessages: Record<string, unknown>;
  missingTexts: string[];
}
```

返回值：

```ts
Record<string, string>
```

插件会把返回的 JSON 合并写入目标语言文件。

## 参数替换

源文案：

```json
{
  "Hello {name}": "你好 {name}"
}
```

调用：

```tsx
<T text="Hello {name}" name="Tom" />
```

结果：

```txt
你好 Tom
```

缺失参数会保留占位符，例如 `{name}`，方便定位问题。
