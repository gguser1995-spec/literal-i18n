# 运行时 Payload 优化升级计划

## 目标

优化 `literal-i18n` 在 Next.js App Router 项目中的运行时传输体积，同时保持这个库最核心的使用体验：

```tsx
<T text="Music Library" />
tr('Search generated songs')
```

默认使用方式仍然应该足够简单：

```tsx
const i18n = await getI18nProviderProps(locale);

<I18nProvider {...i18n}>{children}</I18nProvider>
```

这次升级不应该把 namespace、scope、路由文案映射等心智负担推给业务项目。优化逻辑应尽量收敛在库内部。

## 测试环境要求

后续测试不能直接使用不确定依赖来源的宿主服务，例如：

```txt
http://localhost:3004/en
```

如果该服务实际加载的是线上发布版 `literal-i18n`，那么当前工作区的本地改动不会生效，测试结论会失真。

后续基线和验收测试必须满足以下任一条件：

1. 使用本仓库内的 `demo/` 或 `demo-next-16/`。
2. 创建专门的 fixture 项目，并通过 `file:/Users/lwf/web3/literal-i18n` 明确安装当前工作区版本。
3. 在宿主项目中确认 `node_modules/literal-i18n` 实际指向当前工作区代码。
4. 测试前输出并记录实际加载的 `literal-i18n` 路径和版本。

建议测试前执行类似检查：

```bash
node -e "console.log(require.resolve('literal-i18n/next'))"
node -e "console.log(require('literal-i18n/package.json').version)"
```

对于 ESM-only 入口，可在宿主项目中用动态 import 或包管理器命令确认：

```bash
npm ls literal-i18n
```

只有确认测试服务加载的是当前工作区版本后，才能把 payload 统计结果作为本次升级验收依据。

## 问题描述

初步观察显示，页面不一定会加载所有语言的 JSON，但会把当前语言的整份 messages 传进 HTML/RSC payload。

当前风险点包括：

- 当前 locale 的完整 message table 被传给客户端。
- `sourceMap` 也可能被完整传给客户端。
- RSC client boundary 可能让同一份 provider props 被重复序列化。
- 多处服务端 helper 调用可能重复读取和解析同一个 JSON。

这不是单纯的“读文件慢”问题，而是服务端读取、RSC 序列化、客户端传输共同造成的运行时架构问题。

## 专业角色

### 库作者

- 守住 literal-string driven i18n 的核心定位。
- 不要求用户手动维护 namespace、scope 或页面文案列表。
- 保持公开 API 稳定、可预期。
- 新能力以渐进增强为主，不破坏旧项目。

### Next.js / RSC 性能工程师

- 关注 HTML 体积、RSC stream 体积、client boundary props 序列化。
- 区分“服务端重复读 JSON”和“浏览器实际收到多少 payload”。
- 验证 App Router 下 server component 到 client component 的传输行为。
- 同时关注开发态和生产构建行为。

### 兼容性守门人

- 没有 middleware 时旧项目仍可运行。
- 没有 manifest 时自动回退全量 messages。
- 路由无法命中时自动回退全量 messages。
- `keyMode: 'source'` 和 `keyMode: 'hash'` 都必须兼容。
- 缺失译文时继续 fallback 到源文案，不允许页面白屏。

### 运行时架构设计者

- 设计可复用的 `MessageStore` 中间层。
- 将文件缓存、路由匹配、manifest 查询、message 裁剪分层处理。
- 避免只针对某个 demo 或某个业务项目写一次性逻辑。
- 为后续远程 message store、构建期 manifest、路由级拆包留下扩展空间。

### 测试 / 验收负责人

- 先建立可信基线，再做优化。
- 编写可重复执行的 payload 统计脚本。
- 用真实路由验证，而不是只靠类型检查。
- 覆盖 Next.js 15、Next.js 16、dev、build 等关键场景。

### 文档产品经理

- 先说明零配置默认用法。
- 再说明 middleware 自动优化模式。
- 中英文 README 保持同步。
- `CHANGELOG.md` 继续保持英文。
- 明确说明 fallback 行为和逃生开关。

## 工程行为准则

- 先测量，再设计，再实现。
- 每一步优化都应可单独验收、可回滚。
- 不引入手写 scopes 作为主要方案。
- 优化失败时必须安静回退旧行为。
- manifest 缺失或过期不能导致线上页面异常。
- 修改 server helper 时必须同时考虑 RSC 传输体积。
- 实现后必须用确认加载本地库的测试项目重新测量 payload。

## 设计方案

### 1. MessageStore 中间层

新增服务端 message 访问层：

```ts
MessageStore
  .loadConfig()
  .loadMessages(locale)
  .loadSourceMap()
  .loadManifest()
  .loadRouteMessages(locale, pathname)
```

职责：

- 按绝对文件路径缓存解析后的 JSON。
- 使用 `mtimeMs:size` 判断缓存是否失效。
- 同一进程内去重重复读取和 `JSON.parse`。
- 统一提供全量读取和路由裁剪读取。

这个阶段先解决“多个地方引用导致重复读 JSON”的问题。

### 2. 减少传给客户端的数据

`getI18nProviderProps(locale)` 当前可能把完整 `sourceMap` 传给 client provider。

优化方向：

```ts
getI18nProviderProps(locale, {
  includeSourceMap: false,
});
```

推荐默认行为：

- 默认不向客户端传完整 `sourceMap`。
- 需要调试或兼容旧行为时允许显式开启。

在 hash 模式下，客户端通常可以通过源文案和 id 直接计算 hash key，不一定需要完整 `sourceMap`。

### 3. 抽取 manifest

AST 抽取阶段额外生成内部文件：

```txt
src/messages/manifest.json
```

示例结构：

```json
{
  "files": {
    "src/app/[locale]/page.tsx": [
      "m_abc",
      "m_def"
    ],
    "src/app/[locale]/library/_components/library-workspace.tsx": [
      "m_123"
    ]
  },
  "routes": {
    "/": [
      "m_abc",
      "m_def"
    ],
    "/library": [
      "m_123"
    ]
  }
}
```

manifest 由库生成，业务项目不手写、不维护。

### 4. middleware 传递 pathname

提供轻量 middleware：

```ts
// middleware.ts
import { literalI18nMiddleware } from 'literal-i18n/server';

export default literalI18nMiddleware;
```

已有 middleware 的项目可以组合：

```ts
import { withLiteralI18nRequest } from 'literal-i18n/server';

export default withLiteralI18nRequest(async function middleware(request) {
  // existing middleware logic
});
```

middleware 只做轻量标记，不读 JSON，不裁剪 messages。

内部可以写入 header：

```txt
x-literal-i18n-pathname: /library
```

### 5. 自动路由级裁剪

用户继续调用：

```ts
const i18n = await getI18nProviderProps(locale);
```

内部流程：

1. 从请求 header 读取 pathname。
2. 读取 `manifest.json`。
3. 根据 pathname 找到当前路由需要的 message keys。
4. 从当前语言 JSON 中裁剪 messages。
5. 返回裁剪后的 `messages`。
6. 默认不返回完整 `sourceMap`。
7. 任何一步失败都回退全量 messages。

业务页面不需要传 `scopes`。

## Fallback 策略

优化必须是渐进增强：

- 无 middleware：回退全量 messages。
- 无 manifest：回退全量 messages。
- route 未命中：回退全量 messages。
- manifest 格式异常：回退全量 messages。
- runtime key 缺失：显示源文案。
- 用户显式关闭优化：回退全量 messages。

可选 API：

```ts
getI18nProviderProps(locale, {
  mode: 'auto', // 'auto' | 'full' | 'route'
  includeSourceMap: false,
  fallbackToFullMessages: true,
});
```

推荐默认值：

```ts
{
  mode: 'auto',
  includeSourceMap: false,
  fallbackToFullMessages: true
}
```

## 实施阶段

### 阶段 1：建立可信基线

建立脚本统计：

- URL；
- HTML/RSC 字节数；
- `messages` 出现次数；
- `sourceMap` 出现次数；
- 序列化后的 messages 体积；
- 序列化后的 sourceMap 体积；
- 实际加载的 `literal-i18n` 路径和版本。

验收：

- 测试项目确认加载当前工作区版本。
- 基线数据可重复生成。
- 不再使用不确定依赖来源的宿主服务作为唯一依据。

### 阶段 2：MessageStore 缓存

缓存对象：

- runtime config；
- locale messages；
- source map；
- 后续 manifest。

验收：

- 同一进程内重复调用 helper 不重复读文件和解析 JSON。
- JSON 文件变更后缓存可自动失效。
- 现有 API 返回结构不变。

### 阶段 3：默认不传 sourceMap 到客户端

调整 provider props：

- 默认不包含完整 `sourceMap`。
- 提供 `includeSourceMap: true` 恢复旧行为。

验收：

- RSC payload 中不再出现完整 `sourceMap`。
- hash/source 模式下翻译仍正常。
- 旧项目可以通过选项恢复旧行为。

### 阶段 4：生成 manifest

抽取器输出：

```txt
src/messages/manifest.json
```

验收：

- full scan 能生成 manifest。
- incremental scan 能更新 manifest。
- 删除文件后 manifest 中旧记录会移除。
- hash/source keyMode 都能生成正确 keys。

### 阶段 5：middleware 集成

新增：

```ts
literalI18nMiddleware
withLiteralI18nRequest
```

验收：

- middleware 能写入 pathname header。
- 可组合已有 middleware。
- middleware 不做重 IO。
- 不使用 middleware 时旧行为不变。

### 阶段 6：路由级 messages 裁剪

`getI18nProviderProps(locale)` 自动使用 pathname + manifest 裁剪。

验收：

- 当前路由只返回相关 messages。
- 未命中 route 时回退全量。
- 可以显式关闭裁剪。
- `<T />`、`tr()`、`useTranslate()` 不需要改写。

### 阶段 7：文档和发布

更新：

- `README.md`
- `README.en.md`
- `CHANGELOG.md`
- demo 或 fixture 示例

验收：

- 文档先讲零配置，再讲 middleware 优化。
- 说明 fallback 和关闭方式。
- changelog 使用英文。
- 版本号在验证后再升级。

## 验收清单

### 功能

- 旧项目不改代码仍可运行。
- `getI18nProviderProps(locale)` 仍可直接使用。
- `<T text="..." />` 和 `tr('...')` 不变。
- manifest 缺失不影响页面。
- 缺失译文 fallback 到源文案。

### 性能

- 重复 JSON 读取被缓存。
- 默认不向客户端序列化完整 `sourceMap`。
- middleware + manifest 开启后，当前路由 payload 小于全量 locale payload。
- 有优化前后数据对比。

### 兼容

- Next.js 15 demo 可用。
- Next.js 16 demo 可用。
- dev watcher 启动扫描正常。
- CLI build 前抽取正常。
- `keyMode: 'source'` 可用。
- `keyMode: 'hash'` 可用。

### 质量

- `npm run check` 通过。
- 必要时 `npm run build` 通过。
- payload 测量脚本可重复运行。
- README 中英文同步。
- `CHANGELOG.md` 保持英文。

## 非目标

- 不要求业务项目手写 scopes。
- 不要求用户把原文替换成翻译 key。
- 不把翻译裁剪逻辑放进 middleware。
- 不移除全量 messages 模式。
- 不通过隐藏抽取错误来制造“优化成功”的假象。

## 开放问题

- manifest 是否需要做完整 import graph 分析？
- shared components 默认如何归属路由？
- manifest 中是否同时存 source text 和 key？
- route 匹配应使用 Next segment 规则，还是先做简单 pathname matcher？
- client navigation 时是否需要额外处理 RSC payload 裁剪？

