# literal-i18n GUI 翻译管理方案

## 目标

第一版 GUI 只做翻译管理，不做完整驾驶舱。

目标是提供一个本地页面，让开发者可以：

- 按页面 URL、源码片段、语言、key、字面量语言筛选翻译项。
- 查看只读 `source-map.json`。
- 查看和维护目标语言 JSON，例如 `zh.json`。
- 清空有效翻译项的值，但不删除 key。
- 对单项执行重翻译。
- 显示 AST 未使用的 `key:value`。
- 对 AST 未使用项执行单项删除或勾选批量删除。

第一版不做：

- 初始化向导。
- route payload 可视化诊断。
- 翻译历史。
- 多人协作。
- 云端同步。
- 登录权限。
- GUI 内完整 diff 编辑器。

## 命令入口

新增命令：

```bash
npx literal-i18n gui
```

默认监听：

```txt
http://127.0.0.1:3699
```

约束：

- 只监听 `127.0.0.1`，不监听公网地址。
- 不把 `LITERAL_I18N_API_KEY` 或其他密钥返回给前端。
- GUI 退出不影响 Next dev server。
- GUI 不自动执行破坏性操作，所有删除必须由用户明确点击。

## 数据来源

GUI 从当前项目读取：

```txt
literal-i18n.config.*
src/messages/{sourceLocale}.json
src/messages/{locale}.json
src/messages/source-map.json
src/messages/manifest.json
.next/cache/literal-i18n/extracted-by-file.json
```

默认值：

```txt
sourceLocale = en
localeDir = src/messages
locales = [en, zh]
```

有效 key 的唯一来源是最新 AST 扫描结果：

```txt
validKeys = buildSourceArtifacts(flattenRecordsByFile(extracted-by-file.json)).sourceMessages keys
```

如果 AST cache 不存在或为空：

- 禁止执行 AST 未使用项删除。
- GUI 提示先执行重新扫描。
- 可以提供按钮执行 `literal-i18n extract`，但第一版可以只提示命令。

## 核心概念

### AST 有效项

key 存在于 `validKeys` 中，即为 AST 有效项。

规则：

- 禁止删除 key。
- 可以编辑目标语言 value。
- 可以清空 value，清空后写成空字符串。
- 可以重翻译。

### AST 未使用项

key 不存在于 `validKeys` 中，即为 AST 未使用项。

规则：

- 可以显示。
- 可以单项删除。
- 可以勾选后批量删除。
- 删除前后必须再次在服务端校验，避免用户页面过期导致误删。

### source-map 特殊判断

`source-map.json` 结构是：

```json
{
  "Hello World": "m_xxx"
}
```

判断是否未使用时看 value：

```txt
sourceMapValue 不在 validKeys 中 => AST 未使用项，可删除
sourceMapValue 在 validKeys 中 => AST 有效项，禁止删除
```

`source-map.json` 在普通列表中只读，不能直接编辑。

## 筛选条件

筛选条件同时存在，按 AND 过滤。

### 页面 URL

输入示例：

```txt
/zh/library
/en
```

处理方式：

1. 读取 `manifest.json`。
2. 用 pathname 匹配 route pattern。
3. 取该 route 对应 keys。
4. 同时包含匹配 layout 的 keys。
5. 如果 route 未命中，结果为空，UI 提示未命中，而不是回退全量展示。

### 源码

支持两类输入：

```tsx
<T text="Hello World" />
```

或：

```txt
Hello World
```

处理方式：

- 如果输入包含 `<T text="...">`，优先提取 text 属性。
- 否则按普通 source text 模糊匹配。
- 匹配字段包括 source text、source-map key、AST record text。

### 语言

选择框。

例如：

```txt
zh
de
ja
```

选择后结果区显示对应语言文件：

```txt
src/messages/zh.json
```

source locale 允许查看，但禁止保存、清空、重翻译。

### key

输入 message key。

支持：

- hash key，例如 `m_073083b5b1d08690`
- source mode key，例如 `Hello World`
- source-map key，例如 `Hello World_button`

### 字面量语言

选择框：

```txt
all
english
chinese
mixed
unknown
```

第一版用轻量启发式识别：

- 包含 CJK 字符：`chinese`
- 主要 ASCII 字母：`english`
- 同时包含 CJK 和 ASCII 字母：`mixed`
- 其他：`unknown`

## 页面结构

### 顶部筛选区

```txt
页面 URL | 源码 | 语言 | key | 字面量语言 | 查询 | 重置
```

### Source Map 区

标题：

```txt
source-map.json
```

特性：

- 只读。
- 禁止直接编辑。
- 显示 source-map key/value list。
- 支持跟随筛选条件过滤。

列：

```txt
source-map key | message key | AST 状态
```

AST 状态：

```txt
有效
未使用
```

### 目标语言区

标题示例：

```txt
zh.json
```

列：

```txt
状态 | key | source text | target value | 操作
```

状态：

- `missing`：value 不存在或为空字符串。
- `same-as-source`：value 等于 source text。
- `translated`：value 为非空且不等于 source text。
- `unused`：key 不在 AST validKeys 中。

有效项操作：

```txt
清空
重翻译
保存
```

未使用项操作：

```txt
删除
```

注意：

- 有效项不显示删除按钮。
- 未使用项不显示清空和重翻译按钮。
- source locale 不显示清空、重翻译、保存按钮。

### AST 未使用项区

按钮：

```txt
显示 AST 未使用项
删除已勾选
重新扫描 AST
```

列表：

```txt
选择 | 文件 | 类型 | key/source | value | 操作
```

类型：

- `sourceLocale`
- `targetLocale`
- `sourceMap`

删除规则：

- 单项删除只删除当前文件中的当前 key。
- 批量删除只删除已勾选项。
- 服务端必须再次校验该项仍然不在 AST 中。
- AST 有效项即使前端伪造请求也必须拒绝删除。

## API 设计

API 清单：

- GET `/api/project`
- GET `/api/query`
- POST `/api/locale/clear`
- POST `/api/locale/save`
- POST `/api/locale/retranslate`
- GET `/api/unused`
- POST `/api/unused/delete`
- POST `/api/unused/delete-selected`
- POST `/api/extract`

### `GET /api/project`

返回：

```json
{
  "sourceLocale": "en",
  "locales": ["en", "zh"],
  "localeDir": "src/messages",
  "keyMode": "hash",
  "hasAstCache": true,
  "validKeyCount": 152
}
```

不得返回：

- API key。
- translate hook 函数内容。
- 环境变量原文。

### `GET /api/query`

参数：

```txt
locale
url
source
key
literalLanguage
```

返回：

```json
{
  "locale": "zh",
  "sourceMapRows": [
    {
      "sourceMapKey": "Hello World",
      "messageKey": "m_xxx",
      "astStatus": "used"
    }
  ],
  "localeRows": [
    {
      "key": "m_xxx",
      "source": "Hello World",
      "target": "你好世界",
      "status": "translated",
      "canClear": true,
      "canRetranslate": true,
      "canDelete": false
    }
  ]
}
```

### `POST /api/locale/clear`

请求：

```json
{
  "locale": "zh",
  "key": "m_xxx"
}
```

行为：

- 只允许目标语言。
- key 必须在 AST validKeys 中。
- 写入：

```json
{
  "m_xxx": ""
}
```

不删除 key。

### `POST /api/locale/save`

请求：

```json
{
  "locale": "zh",
  "entries": {
    "m_xxx": "你好世界"
  }
}
```

行为：

- 只允许目标语言。
- 只更新传入 keys。
- stale keys 默认保留。
- JSON 使用稳定格式：

```js
JSON.stringify(value, null, 2) + '\n'
```

### `POST /api/locale/retranslate`

请求：

```json
{
  "locale": "zh",
  "key": "m_xxx"
}
```

行为：

- key 必须在 AST validKeys 中。
- 从 source locale 或 sourceMeta 找到 source text。
- 调用当前 config 中的 `translateJsonHook`。
- 成功时只更新该 key。
- 失败时不覆盖旧值。
- source locale 禁止重翻译。

### `GET /api/unused`

返回 AST 未使用项：

```json
{
  "validKeyCount": 152,
  "items": [
    {
      "file": "src/messages/zh.json",
      "type": "targetLocale",
      "locale": "zh",
      "key": "m_old",
      "value": "旧文案",
      "canDelete": true
    },
    {
      "file": "src/messages/source-map.json",
      "type": "sourceMap",
      "key": "Old text",
      "value": "m_old",
      "canDelete": true
    }
  ]
}
```

### `POST /api/unused/delete`

请求：

```json
{
  "file": "src/messages/zh.json",
  "key": "m_old"
}
```

行为：

- 服务端重新读取 AST validKeys。
- 服务端重新读取文件。
- 如果 key 已变成 AST 有效项，拒绝删除。
- 如果是 `source-map.json`，按 value 是否在 validKeys 中判断。
- 只删除指定文件中的指定 key。

### `POST /api/unused/delete-selected`

请求：

```json
{
  "items": [
    {
      "file": "src/messages/zh.json",
      "key": "m_old"
    }
  ]
}
```

行为：

- 对每项逐个服务端校验。
- 只删除通过校验的项。
- 返回成功和跳过列表。

### `POST /api/extract`

第一版可以可选实现。

行为：

- 执行一次 `LiteralI18nExtractor.fullScan('gui')`。
- 刷新 AST cache、source locale、source-map、manifest。
- 用于“重新扫描 AST”按钮。

## 实现方案

### 阶段 1：后端能力

新增：

```txt
src/gui-server.cjs
```

负责：

- 启动本地 HTTP server。
- 读取 config。
- 读取 messages。
- 读取 AST cache。
- 计算 validKeys。
- 执行查询和保存。
- 执行 AST 未使用项删除。

`bin/literal-i18n.mjs` 新增：

```bash
literal-i18n gui
```

### 阶段 2：静态页面

第一版不引入 React/Vite。

`gui-server` 直接返回内嵌 HTML：

```txt
GET /
```

页面用原生 HTML/CSS/JS：

- 表单筛选。
- fetch API。
- table 渲染。
- textarea 编辑 target。
- 按钮调用 clear/retranslate/delete。

### 阶段 3：安全写入

统一 JSON 写入函数：

```js
writeJsonStable(filePath, value)
```

要求：

- 只允许写 `localeDir` 下的 JSON 文件。
- 禁止路径穿越。
- 写入格式稳定。
- 写入前重新读取文件并 merge。

### 阶段 4：重翻译

复用 config 中的 `translateJsonHook`。

单项重翻译输入：

```js
{
  locale,
  sourceLocale,
  sourceMessages,
  existingMessages,
  missingTexts: [sourceText],
  missingMessages: [{ key, text: sourceText }]
}
```

返回后只读取当前 key 的译文。

## 工程化要求

GUI 代码必须按可维护的工程模块实现，不能把所有逻辑堆在一个 HTTP handler 或前端脚本里。

### 模块边界

建议拆分为：

```txt
src/gui-server.cjs
src/gui/project.cjs
src/gui/query.cjs
src/gui/unused.cjs
src/gui/write-json.cjs
src/gui/retranslate.cjs
src/gui/static-page.cjs
```

职责：

- `gui-server.cjs` 只负责启动 HTTP server、路由分发、统一错误响应。
- `project.cjs` 负责读取 config、messages、manifest、AST cache。
- `query.cjs` 负责筛选、状态计算、source-map 行和 locale 行拼装。
- `unused.cjs` 负责 AST 未使用项计算和删除前二次校验。
- `write-json.cjs` 负责安全路径、稳定格式、原子写入。
- `retranslate.cjs` 负责 translate hook 调用和单 key 结果提取。
- `static-page.cjs` 只负责返回 HTML/CSS/JS 字符串。

### 代码质量

要求：

- 所有核心逻辑必须是可单测的纯函数或近似纯函数。
- 文件读写集中在少数模块内，不在业务计算函数中散落 `fs` 调用。
- API response 使用稳定结构，不能返回函数、环境变量、绝对路径或密钥。
- 错误要返回可读 message 和稳定 error code。
- 删除、清空、保存、重翻译都必须幂等；重复请求不能破坏数据结构。
- 写 JSON 前必须重新读取当前文件，避免基于旧内存覆盖用户刚改的内容。
- JSON 写入必须使用临时文件 + rename，避免进程中断写出半截文件。
- 默认不引入大型前端构建链；第一版保持零前端构建依赖。
- 新增第三方依赖必须有明确理由，并同步写入文档和 changelog。
- 日志默认简洁，调试日志必须受环境变量控制，例如 `LITERAL_I18N_DEBUG=1`。

### 类型与兼容性

要求：

- 对外 API 和核心数据结构需要在 `.d.ts` 或 JSDoc 中描述。
- 保持 Node.js 当前包支持范围内可运行。
- 继续兼容 CJS 项目、ESM 项目、`literal-i18n.config.js`、`literal-i18n.config.cjs`、`literal-i18n.config.mjs`、`literal-i18n.config.ts`。
- `literal-i18n gui` 不能影响已有 `extract`、`watch`、`init`、Next plugin、middleware/proxy 行为。

### 测试要求

必须覆盖：

- hash mode 查询。
- source mode 查询。
- URL + layout keys 过滤。
- `<T text="xxx" />` 源码过滤。
- 字面量语言过滤。
- source-map 未使用判断按 value 计算。
- AST 有效项禁止删除。
- AST 未使用项可单删和批量删。
- 清空写成空字符串，不删除 key。
- source locale 禁止保存、清空、重翻译。
- 重翻译成功只更新当前 key。
- 重翻译失败不覆盖旧值。
- path traversal 请求被拒绝。
- AST cache 缺失时禁止删除。
- API response 不包含 API key、环境变量原文、translate hook 函数体。

### 验收命令

实现后至少执行：

```bash
npm run check
npm run build
node --check bin/literal-i18n.mjs
node --check src/gui-server.cjs
```

如果新增独立测试命令，补充：

```bash
npm run test:gui
```

## 验收方案

### 第一轮：数据正确性验收

目标：验证 source/source-map/locale/AST validKeys 的计算正确。

Fixture：

- hash mode。
- source mode。
- `source-map.json` 包含有效项和未使用项。
- `en.json` 包含有效项和未使用项。
- `zh.json` 包含有效项、空字符串、same-as-source、未使用项。
- AST cache 中只包含部分 keys。

验收点：

1. `validKeys` 只来自 AST cache。
2. source-map 是否未使用按 value 判断。
3. `en.json` 未使用项可显示为可删除。
4. `zh.json` 未使用项可显示为可删除。
5. AST 有效但空字符串的 key 不出现在未使用列表。
6. same-as-source 是状态，不是未使用项。
7. hash/source 两种模式都能显示 source text。

### 第二轮：交互安全验收

目标：验证所有写操作不误删、不越权。

验收点：

1. AST 有效项不显示删除按钮。
2. 伪造请求删除 AST 有效项，服务端拒绝。
3. 清空有效项只把 value 写成 `""`，不删除 key。
4. source locale 禁止清空、保存、重翻译。
5. 删除 AST 未使用单项只影响指定文件和指定 key。
6. 批量删除只删除勾选项。
7. source-map 删除前按 value 再次校验。
8. 重翻译失败不覆盖旧值。
9. 写入后 JSON 格式稳定。
10. API key 不出现在任何 API 响应里。

### 第三轮：端到端 GUI 验收

目标：模拟真实用户使用。

流程：

1. 启动：

```bash
npx literal-i18n gui
```

2. 打开：

```txt
http://127.0.0.1:3699
```

3. 选择 `zh`。
4. 输入页面 URL 过滤。
5. 输入 `<T text="xxx" />` 过滤。
6. 输入 key 过滤。
7. 切换字面量语言过滤。
8. 编辑目标译文并保存。
9. 清空一个有效项。
10. 显示 AST 未使用项。
11. 删除单个未使用项。
12. 勾选多个未使用项批量删除。
13. 重启 GUI，确认保存结果仍存在。

验收点：

1. 多筛选条件按 AND 生效。
2. source-map 区只读。
3. 目标语言区可编辑。
4. 有效项没有删除按钮。
5. 未使用项有删除按钮。
6. 删除不会影响 AST 有效项。
7. 保存后 JSON 正确写回。
8. 重启后读到上次保存结果。
9. 监听地址是 `127.0.0.1`。
10. 页面和 API 都不泄漏 API key。

## 三轮验收通过标准

三轮都必须通过才算完成：

```txt
第一轮：数据模型无误
第二轮：写操作安全
第三轮：端到端用户流程可用
```

任何一轮失败：

- 先修实现。
- 重新执行失败轮。
- 再从第一轮重新跑到第三轮。

如果任意一轮失败，必须修复后从第一轮重新跑。

最终交付前必须同时通过：

```bash
npm run check
node --check bin/literal-i18n.mjs
node --check src/gui-server.cjs
```

如果改动影响 extractor 或 runtime，还必须通过：

```bash
node --check src/extract-core.cjs
node --check src/next-plugin.cjs
npm run build
```

## 风险与边界

### AST cache 缺失

不能执行删除。

显示：

```txt
没有找到 AST 扫描结果。请先运行 npx literal-i18n extract，或点击重新扫描 AST。
```

### 用户手写 stale key

默认保留，只有显示在 AST 未使用项列表后，由用户手动删除。

### source-map 和 locale 不一致

GUI 不能自动猜测修复。

只展示状态，并允许用户按 AST 未使用项规则删除。

### translateJsonHook 不存在

重翻译按钮置灰，或点击后返回：

```txt
当前配置没有 translateJsonHook，无法重翻译。
```

### translateJsonHook 失败

不覆盖旧值。

展示错误信息。

### 路径安全

所有 API 的 file 参数必须限制在 `localeDir` 内。

禁止：

```txt
../
绝对路径
localeDir 之外的路径
```

## 第一版文件清单

计划新增：

```txt
src/gui-server.cjs
```

计划修改：

```txt
bin/literal-i18n.mjs
README.md
README.en.md
CHANGELOG.md
```

暂不新增前端构建目录。
