# 联网搜索 Agent 实现记录

本文档记录 Chat Mini 的联网搜索 Agent 当前实现。该能力已落地，不再是待审核设计稿。

## 目标

在保持项目轻量的前提下，引入一个最小化 agent 循环，仅提供 `web_search` 工具，基于 Tavily 获取实时信息。

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
```

未配置 `TAVILY_API_KEY` 时，开启联网搜索会返回 400：

```json
{
  "error": {
    "message": "未配置 TAVILY_API_KEY，无法使用联网搜索。"
  }
}
```

`HTTPS_PROXY` 会同时作用于 OpenAI 兼容接口和 Tavily 请求。

### 应用常量

位于 `src/config/constants.ts`：

```ts
export const AGENT = {
  MAX_TOOL_ROUNDS: 3,
  TAVILY_MAX_RESULTS: 5,
  TAVILY_SEARCH_DEPTH: 'basic' as 'basic' | 'advanced',
} as const
```

## 后端实现

### Tavily 客户端

文件：`src/utils/tavily.ts`

- 调用 `https://api.tavily.com/search`
- 默认 `max_results = 5`
- 默认 `search_depth = 'basic'`
- 支持透传 `dispatcher`，复用 `HTTPS_PROXY`

### 工具定义

文件：`src/config/tools.ts`

当前仅有一个工具：

- `web_search`
- 参数：`query: string`
- 说明：用于搜索互联网获取实时信息、事实核查或模型不确定的问题

### API 路由

文件：`src/pages/api/generate.ts`

核心流程：

1. 校验输入、访问密码、签名和模型白名单。
2. `webSearch` 关闭时，走原有单次流式请求。
3. `webSearch` 开启时，检查 `TAVILY_API_KEY`。
4. 进入 agent 循环，最多执行 `AGENT.MAX_TOOL_ROUNDS` 轮。
5. 中间轮请求 OpenAI 兼容接口并解析 `tool_calls`。
6. 执行 Tavily 搜索，将结果作为 `role: 'tool'` 消息回灌给模型。
7. 向前端输出 `<tool>` 展示信息和 `<tool_data>` 协议数据。
8. 模型不再调用工具或触达轮次上限后，输出最终答案。

兼容处理：

- 支持标准 OpenAI `tool_calls`。
- 兼容部分上游把工具调用输出为 XML 风格 `<tool_call>` 正文的情况。
- 兼容流式分片中的 `tool_calls` 合并。
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
- 未配置 `TAVILY_API_KEY` 且开启联网时，返回明确错误。
- 开启联网后，搜索过程显示在折叠面板中。
- 搜索结果可被模型用于最终回答。
- 历史会话恢复后，联网搜索折叠面板仍可显示。
- 后续追问能复用本轮 `tool_data` 上下文。
- `HTTPS_PROXY` 对 Tavily 请求生效。

## 相关文件

- `src/config/tools.ts`
- `src/config/constants.ts`
- `src/utils/tavily.ts`
- `src/utils/tagParser.ts`
- `src/pages/api/generate.ts`
- `src/hooks/useChatStream.ts`
- `src/components/ChatRoot.tsx`
- `src/components/MessageItem.tsx`
- `src/types/index.ts`
- `.env.example`
