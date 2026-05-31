# 网络搜索 Agent 能力 — 设计方案（待审核）

> 目标：给 Chat Mini 增加一个**最小化的 agent 循环**，仅引入一个工具 `web_search`（基于 Tavily）。
> 不引入 Skills、不引入多工具调度、不做插件体系，保持项目"迷你"调性。

---

## 1. 设计原则

1. **单工具**：只做 `web_search`，不做 URL 抓取、不做计算器、不做文件读写等。
2. **单格式**：所有上游已转换为 OpenAI 兼容协议，使用 OpenAI `tools` / `tool_calls` 协议，不做厂商分支。
3. **显式开启**：前端加一个"联网搜索"开关，默认关闭。关闭时请求体里完全不带 `tools` 字段，**对所有现有逻辑零影响**。
4. **轮次有界**：服务端最多执行 `MAX_TOOL_ROUNDS = 3` 轮工具循环，触顶后强制模型给出最终答复。
5. **流式只在最后一轮**：中间轮次为了拿 `tool_calls` 走非流式；判定模型已不再调用工具后，开启流式输出最终答案。这样前端 SSE 解析逻辑几乎不用动。
6. **过程可见**：把"正在搜索 xxx""共 N 条结果"等元信息以 `<tool>...</tool>` 标签注入到 SSE 流中，前端复用现有 `<think>` 折叠样式渲染。
7. **不持久化工具中间结果**：助手消息存档时只保留最终文本和 `<tool>` 折叠块（同 think 的做法），不把 raw `tool_calls` / `tool` 角色消息写入历史 — 简化历史管理。

---

## 2. 用户体验

### 2.1 入口

在 Header 当前模型选择器旁边，增加一个圆形/胶囊按钮："🌐 联网"（关 / 开两态）。

- 开关状态保存在 `localStorage`（key: `web-search-enabled`），刷新后保留。
- 开启状态下，发送消息时请求体多带一个字段 `webSearch: true`。
- 关闭状态下，**完全等同于当前行为**。

### 2.2 对话中可视化

```
你：英伟达今天股价多少？
─────────────────
[助手]
  ▶ 🔍 联网搜索 (点击展开)            ← 复用 think 折叠样式
      ─ 搜索: "NVIDIA stock price today"
      ─ 找到 5 条结果（Bloomberg, Yahoo Finance, ...）
  英伟达 (NVDA) 今天收盘价为 $XXX...   ← 模型最终回答，正常流式渲染
```

折叠块的内容是后端注入的元信息，**不是模型的 reasoning**。但复用同一套 UI 组件，避免新增样式。

---

## 3. 后端改造

### 3.1 新文件：`src/utils/tavily.ts`

```ts
const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

export interface TavilyResult {
  title: string
  url: string
  content: string  // Tavily 返回的摘要
  score?: number
}

export interface TavilySearchResponse {
  query: string
  results: TavilyResult[]
  answer?: string  // Tavily 可选的 quick answer
}

export const tavilySearch = async(
  query: string,
  opts?: { maxResults?: number; searchDepth?: 'basic' | 'advanced' },
): Promise<TavilySearchResponse> => {
  const apiKey = import.meta.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured')

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: opts?.maxResults ?? 5,
      search_depth: opts?.searchDepth ?? 'basic',
      include_answer: false,
    }),
  })

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  return res.json()
}
```

> 注意：Tavily 的 `search_depth: advanced` 算 2 个 credit，默认用 `basic`。

### 3.2 工具描述（注入到 OpenAI 请求）

```ts
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索互联网获取实时信息。当用户询问最新事件、当前数据、需要事实核查或你不确定答案时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，使用用户问题中的核心词，可适当英文化以提升覆盖' },
      },
      required: ['query'],
    },
  },
} as const
```

### 3.3 改造 `src/utils/chatCompletion.ts`

`generatePayload` 增加可选参数：

```ts
export const generatePayload = (
  apiKey: string,
  messages: ChatMessage[],
  temperature: number,
  model: string,
  opts?: { stream?: boolean; tools?: any[]; toolChoice?: 'auto' | 'none' },
): RequestInit & { dispatcher?: any } => {
  ...
  body: JSON.stringify({
    model,
    messages: transformedMessages,
    temperature,
    stream: opts?.stream ?? true,
    ...(opts?.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
  })
}
```

新增一个工具：把上游一次性（非流式）响应里的 `assistant` 消息（含 `tool_calls`）解析出来。

### 3.4 改造 `src/pages/api/generate.ts` — 核心循环

伪代码：

```ts
const MAX_TOOL_ROUNDS = 3

if (!webSearch) {
  // 现有逻辑，保持不变 — 一次流式请求直接返回
  return parseOpenAIStream(await fetch(...stream=true...))
}

// agent 循环
const workingMessages = [...messages]
let round = 0

// 创建一个聚合 SSE 流返回给前端
return new Response(new ReadableStream({
  async start(controller) {
    const enc = new TextEncoder()
    const writeTag = (tag: 'tool', body: string) =>
      controller.enqueue(enc.encode(`<${tag}>${body}</${tag}>`))

    while (round < MAX_TOOL_ROUNDS) {
      // 第一次非流式：拿可能存在的 tool_calls
      const resp = await fetch(baseUrl + '/chat/completions', generatePayload(
        apiKey, workingMessages, temperature, model,
        { stream: false, tools: [WEB_SEARCH_TOOL], toolChoice: 'auto' },
      )).then(r => r.json())

      const msg = resp.choices[0].message
      workingMessages.push(msg)

      if (!msg.tool_calls?.length) {
        // 模型不再调用工具 — 把 content 直接 enqueue 即可
        if (msg.content) controller.enqueue(enc.encode(msg.content))
        controller.close()
        return
      }

      // 执行所有 tool_calls（一般就 1 个）
      for (const call of msg.tool_calls) {
        const args = JSON.parse(call.function.arguments)
        writeTag('tool', `🔍 搜索: ${args.query}`)
        try {
          const result = await tavilySearch(args.query)
          writeTag('tool', `共 ${result.results.length} 条结果`)
          workingMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result.results.map(r => ({
              title: r.title, url: r.url, snippet: r.content,
            }))),
          })
        } catch (e) {
          writeTag('tool', `搜索失败: ${e.message}`)
          workingMessages.push({
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify({ error: e.message }),
          })
        }
      }
      round++
    }

    // 触顶：最后一次流式请求，强制不再调用工具
    const finalResp = await fetch(baseUrl + '/chat/completions', generatePayload(
      apiKey, workingMessages, temperature, model,
      { stream: true, toolChoice: 'none' },  // 注意：不传 tools 或传 toolChoice=none
    ))
    // 把流转发到 controller（复用 parseOpenAIStream 的逻辑或直接 pipe）
    ...
  },
}))
```

**关于流式策略的权衡**：
- 中间轮非流式 → 简单可靠，缺点是中间轮延迟比流式高。但工具循环本身就要等搜索 API 返回，用户能感知到的延迟主要来自 Tavily 而不是这里。
- 最后一轮流式 → 用户最关心的"最终回答"打字效果保留。
- 这种"中间非流式 + 末轮流式"的取舍是为了**避免在流中解析 `tool_calls`**（流式 tool_calls 是分片到达的，要做 chunk 拼接，复杂度上升明显）。

### 3.5 `<tool>` 标签处理

复用通用 `tagParser`：把原先只服务于 think 的解析逻辑泛化为支持多个 tag。
推荐做法：**使用 `createTagParser({ tags: ['think', 'tool'], onText, onTag })`**，让 think 和 tool 都走通用机制，避免继续保留只包一层的 `thinkTagParser` 壳文件。

---

## 4. 前端改造

### 4.1 Header 加开关

新组件 `src/components/WebSearchToggle.tsx`：圆形按钮，开/关两态，状态读写 localStorage，切换时派发 CustomEvent `web-search-change`。

### 4.2 `ChatRoot.tsx`

- 新增 `webSearchEnabled` signal，挂到上述 CustomEvent。
- `requestWithLatestMessage` 的 fetch body 增加 `webSearch: webSearchEnabled()`。
- 接收一个新的累加 signal `currentAssistantToolMessage`，通过新的 tag parser 的 `onTool` 回调写入。

### 4.3 `MessageItem.tsx`

当前已经有 `thinkMessage` 折叠块的实现（用户选中的 263 行附近就是 `<Show>` 块）。复制一份做 `toolMessage` 折叠块即可，文案改成「联网搜索」，图标可以用一个现成的 carbon icon（如 `IconSearch`）。

### 4.4 `ChatMessage` 类型

`src/types/index.ts` 给 `ChatMessage` 增加可选字段：

```ts
toolTrace?: string  // 工具调用的元信息（已渲染的纯文本），用于历史回放
```

存档时把累加好的 tool 文本一起写进去；加载历史时如有 `tool` 就显示折叠块。

---

## 5. 配置

### 5.1 环境变量

`.env.example` 新增：

```
# Tavily API key for web search tool. Leave empty to disable.
TAVILY_API_KEY=
```

服务端在收到 `webSearch: true` 但 `TAVILY_API_KEY` 未配置时，返回 400 错误提示。

### 5.2 `src/config/constants.ts`

```ts
export const AGENT = {
  MAX_TOOL_ROUNDS: 3,
  TAVILY_MAX_RESULTS: 5,
  TAVILY_SEARCH_DEPTH: 'basic' as 'basic' | 'advanced',
} as const
```

---

## 6. 签名 / 鉴权

现有 `verifySignature` 基于 `messages[last].content`。`webSearch` 字段不参与签名，**因为它不影响"用户说了什么"的事实**，攻击者翻转该字段只能多花你 Tavily 配额，不能伪造用户身份。可接受。

如果觉得不放心，可以把 `webSearch` 拼到签名 payload 里，前后端各加一行，成本可忽略。

---

## 7. 错误与边界

| 情况 | 处理 |
|---|---|
| Tavily 超时/失败 | 把错误信息作为 tool 消息回灌给模型，让它"知道搜索失败"，继续作答 |
| 触达 `MAX_TOOL_ROUNDS` | 强制最后一轮 `tool_choice: 'none'`，让模型基于现有上下文作答 |
| 模型返回的 `arguments` JSON 解析失败 | 同上，把解析错误作为 tool 消息回灌 |
| 用户在工具循环中点击"停止" | `AbortController` 中断后端流，已收到的 `<tool>` 块保留在 UI 上 |
| 上游模型不支持 tools | 走错误返回。**项目作者已确认所有 9 个模型均为 OpenAI 兼容格式且支持 tools**，故不做模型白名单 |

---

## 8. 不做的事（明确划定边界）

- ❌ 不引入 Skills 体系
- ❌ 不做 URL 内容抓取工具（如果搜索摘要不够，下一版再说）
- ❌ 不做计算器、代码执行、文件读取等工具
- ❌ 不做工具结果在历史中的"原数据"存储（只存渲染后的折叠文本）
- ❌ 不做流式 `tool_calls` 解析（中间轮直接非流式）
- ❌ 不做"自动决定要不要搜索"的智能开关 — 用户手动开
- ❌ 不针对不同模型做适配分支

---

## 9. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/utils/tavily.ts` | **新增** |
| `src/utils/chatCompletion.ts` | `generatePayload` 增加 `opts` 参数 |
| `src/utils/tagParser.ts` | 泛化为多 tag parser |
| `src/pages/api/generate.ts` | 增加 agent 循环分支 |
| `src/components/WebSearchToggle.tsx` | **新增** |
| `src/components/Header.astro` | 嵌入 `WebSearchToggle` |
| `src/components/ChatRoot.tsx` | 接收开关状态、解析 `<tool>` 块、传 `toolTrace` 字段 |
| `src/components/MessageItem.tsx` | 增加 `toolMessage` 折叠块 |
| `src/types/index.ts` | `ChatMessage` 增加 `toolTrace?: string` |
| `src/config/constants.ts` | 增加 `AGENT` 常量块 |
| `.env.example` | 增加 `TAVILY_API_KEY` |
| `CLAUDE.md` | 在功能特性、环境变量、应用内常量段落各加一行 |

预计改动量：**新增 ~250 行，修改 ~80 行**。

---

## 10. 实施顺序（建议分 commit）

1. `feat: add tavily web search util` — 只加 `utils/tavily.ts` + env var，独立可测
2. `feat: generalize think tag parser` — parser 重构 + 单测
3. `feat: add agent loop to generate api` — 后端循环，前端先不接，用 curl 测试
4. `feat: add web search toggle UI` — 前端开关 + ChatRoot 接 webSearch 字段
5. `feat: render tool calls in message item` — 折叠块 UI
6. `docs: update README and CLAUDE.md`

---

## 待审核问题

请确认以下决策是否符合你的预期：

1. **触发方式**：前端开关（默认关）vs. 总是带工具让模型自己决定？— 我选了前者，省 token、避免对不需要联网的对话产生额外延迟。
2. **流式策略**：中间轮非流式、末轮流式 vs. 全程流式 + 解析流式 tool_calls？— 我选了前者，复杂度更低。
3. **历史存档**：是否把 `<tool>` 元信息写入历史并在回放时显示折叠块？— 我选了"是"，体验完整。
4. **`MAX_TOOL_ROUNDS = 3` 是否合适？** — 个人聊天 1-2 次就够，3 是安全垫。
5. **是否需要在 `web_search` 工具里加 URL 抓取子能力？** — 我选了不加，保持单工具。
