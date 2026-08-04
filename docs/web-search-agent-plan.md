# 联网搜索 Agent 实现记录

本文档记录 Chat Mini 的联网搜索 Agent 当前实现。该能力已落地，不再是待审核设计稿。

## 目标

在保持项目轻量的前提下，引入一次规划、并行搜索、一次最终生成的联网搜索流程，仅提供 `web_search` 工具，通过 Tavily 获取实时信息，并支持降级到 SearXNG。

## 用户体验

- 联网入口位于输入框底栏的“联网”按钮。
- 默认关闭，开启状态保存在 `localStorage` 的 `web-search-enabled`。
- 开启后，请求体会携带 `webSearch: true`。
- 关闭时走原有单次 OpenAI 兼容流式请求，不携带 tools。
- 搜索过程会显示在助手消息中的“联网搜索”折叠面板里。
- agent 中间协议消息通过 `<tool_data>` 透传并持久化，用于后续对话回灌；用户只看到 `<tool>` 生成的展示信息。

## 配置

### 环境变量

```bash
TAVILY_API_KEY=
SEARXNG_BASE_URL=
```

搜索渠道支持以下配置：

- 配置 `TAVILY_API_KEY` 时优先使用 Tavily。
- 同时配置 `SEARXNG_BASE_URL` 时，Tavily 请求失败会自动降级到 SearXNG。
- 仅配置 `SEARXNG_BASE_URL` 时直接使用 SearXNG。
- 两项均未配置时，开启联网搜索会返回 400。

`HTTPS_PROXY` 会同时作用于 OpenAI 兼容接口、Tavily 和 SearXNG 请求。

### 应用常量

位于 `src/config/constants.ts`：

```ts
export const AGENT = {
  TAVILY_MAX_RESULTS: 5,
  TAVILY_SEARCH_DEPTH: 'basic' as 'basic' | 'advanced',
  SEARXNG_MAX_RESULTS: 5,
} as const
```

## 后端实现

### 搜索客户端

文件：`src/utils/tavily.ts`、`src/utils/searxng.ts`

- Tavily 调用 `https://api.tavily.com/search`，默认 `max_results = 5`、`search_depth = 'basic'`。
- SearXNG 调用自部署实例的 `/search` JSON API，并在客户端截取指定数量的结果。
- Tavily 不可用时可降级到 SearXNG，也支持仅配置 SearXNG。
- 两个客户端都支持透传 `dispatcher` 和 `AbortSignal`，复用代理并在流程超时时中止请求。

### 工具定义

文件：`src/config/tools.ts`

最终生成阶段仅保留 `web_search` schema，用于兼容严格校验历史工具消息的上游，并通过 `tool_choice: none` 禁止再次调用。

规划阶段提供两个工具：

- `web_search`：参数为 `query: string`，一次规划可返回多个调用。
- `skip_web_search`：表示当前问题无需联网，服务端直接进入最终生成。

### API 路由

文件：`src/pages/api/generate.ts`

核心流程：

1. 校验输入、访问密码、签名和模型白名单。
2. `webSearch` 关闭时，走原有单次流式请求。
3. `webSearch` 开启时，检查 Tavily 或 SearXNG 是否至少配置一项。
4. 发起一次规划请求，要求模型调用 `web_search` 或 `skip_web_search`。
5. 模型可一次返回多个 `web_search`，服务端并行执行，并将结果作为 `role: 'tool'` 消息回灌。
6. 规划请求失败或响应没有工具调用时，按 `skip_web_search` 降级，避免兼容上游不支持或忽略 `tool_choice: required` 后产生硬错误。
7. 向前端输出带查询词的 `<tool>` 展示信息，以及 `<tool_data>` 协议数据。
8. 发起唯一一次最终流式生成，并通过 `tool_choice: none` 禁止再次调用工具。
9. 流程超时时关闭用户流并中止仍在进行的规划、搜索或最终生成请求。

兼容处理：

- 支持标准 OpenAI `tool_calls`。
- 兼容部分上游把工具调用输出为 XML 风格 `<tool_call>` 正文的情况。
- 兼容流式分片中的 `tool_calls` 合并。
- 兼容部分上游不支持 `tool_choice: required` 或忽略它并返回纯文本的情况，此时跳过搜索并进入最终生成。
- 搜索结果中的 `<` 会被转义，避免破坏前端 tag parser。

## 前端实现

### 状态与请求

文件：`src/components/ChatRoot.tsx`

- 维护 `webSearchEnabled` signal。
- 从 `localStorage` 恢复联网开关状态。
- 请求 `/api/generate` 时带上 `webSearch`。
- 输入框底栏按钮通过 `aria-pressed` 和视觉状态展示开关。

### 流解析

文件：`src/hooks/useChatStream.ts`

- 使用通用 tag parser 解析 `think`、`tool`、`tool_data`。
- `tool` 内容写入当前助手消息的 `toolTrace`。
- `tool_data` 累积为原始 agent 中间协议数据，用于历史和后续请求上下文。

### 消息展示

文件：`src/components/MessageItem.tsx`

- `toolTrace` 会显示为“联网搜索”折叠面板。
- Markdown 渲染出的链接会在新标签页打开，避免搜索结果链接把当前聊天页跳走。

### 类型

文件：`src/types/index.ts`

- `toolTrace?: string`：联网搜索等工具调用过程信息，仅展示用。
- `toolContext?: string`：agent 中间协议消息，供后续对话回灌。

## 签名与鉴权

- 访问密码仍由 `SITE_PASSWORD` 控制。
- 生产环境签名仍基于最后一条用户消息内容校验。
- `webSearch` 字段不参与签名。翻转该字段不能伪造用户消息，但会影响 Tavily 配额，因此部署时应结合访问密码使用。

## 明确不做

- 不引入 Skills / 插件体系。
- 不做 URL 正文抓取工具。
- 不做计算器、代码执行、文件读取等额外工具。
- 不为不同模型维护工具协议分支。
- 不把 Tavily 原始结果直接展示给用户，只展示过程摘要和模型最终回答。

## 验证重点

- 联网关闭时，普通聊天仍走原有流式路径。
- Tavily 和 SearXNG 均未配置且开启联网时，返回明确错误。
- 仅配置 SearXNG 时可以正常搜索，Tavily 失败时可以自动降级。
- 规划请求失败或没有返回工具调用时，仍能进入最终生成并返回回答。
- 多个搜索并行执行时，成功、失败和降级提示都能通过查询词区分。
- 搜索结果可被模型用于最终回答。
- 历史会话恢复后，联网搜索折叠面板仍可显示。
- 后续追问能复用本轮 `tool_data` 上下文。
- `HTTPS_PROXY` 对 Tavily 和 SearXNG 请求生效。
- watchdog 超时后，不再继续发起后续请求，并会取消仍在进行的请求。

## 相关文件

- `src/config/tools.ts`
- `src/config/constants.ts`
- `src/utils/tavily.ts`
- `src/utils/searxng.ts`
- `src/utils/tagParser.ts`
- `src/pages/api/generate.ts`
- `src/hooks/useChatStream.ts`
- `src/components/ChatRoot.tsx`
- `src/components/MessageItem.tsx`
- `src/types/index.ts`
- `.env.example`
