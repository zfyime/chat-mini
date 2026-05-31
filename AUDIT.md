# Chat Mini 架构审计与 Bug 排查报告

> 审计时间：2026-05-31
> 范围：架构合理性、命名一致性、真实 bug、可维护性气味、优先级建议

---

## 一、架构总览

层次基本清晰：`pages/api` → `utils/*` 纯函数 → `store/historyStore` 状态 → `components/*`。但有几处职责越界：

- **`Generator.tsx`（≈550 行）是重灾区**：聚合了流式请求、标签解析、附件管理、历史保存、导出菜单、跨组件事件桥。建议拆 `useChatStream` / `useHistoryPersist` / `useExportMenu` 三个 hook。
- **存储分裂**：`store/historyStore.ts` 与 `utils/chatSession.ts` 各做一套 "IndexedDB + 兜底"，前者降级到 localStorage、后者降级到 sessionStorage，逻辑重复且容易漂移。
- **跨组件通信走 `window` CustomEvent**：`model-change`、`web-search-change`、`streaming-state-change`、`toggle-history` 四条隧道，状态分散在 Generator/ModelSelector/WebSearchToggle 三处副本里，是后面那个"刷新后模型不一致"bug 的根源。

---

## 二、命名问题

| 现名 | 问题 | 建议 |
|---|---|---|
| `utils/openAI.ts` | 已支持多家模型 + Tavily agent | `chatCompletion.ts` 或 `llmStream.ts` |
| `utils/thinkTagParser.ts` | 已是 `tagParser` 的 5 行壳子，**且全仓库零调用** | 直接删 |
| `utils/tagParser.ts` + `thinkTagParser.ts` | 两个名字易混 | 删壳保留 `tagParser` |
| `Generator.tsx` | 泛名，实质是聊天主页 | `ChatRoot.tsx` |
| `historyStore` 的 `historyState` 导出 | 名字 + 导出风格混杂 | 全部具名导出 |
| `ChatMessage.tool` | 单数 string，实际存多次工具调用 HTML | `toolTrace` |
| `MAX_HISTORY_MESSAGES` vs `MAX_HISTORY_COUNT` | 全靠注释区分 | `CONTEXT_WINDOW_SIZE` / `HISTORY_LIST_LIMIT` |
| `SAVE_DEBOUNCE_TIME` | 实际用的是 `useThrottleFn`（见下方 bug） | 改成 debounce 或重命名 `SAVE_THROTTLE_MS` |
| `chatSession.ts` | 名字暗示 sessionStorage，实际首选 IndexedDB | `currentChatStore.ts` |

---

## 三、确认的 Bug（按严重度排序）

### Bug 1 — 刷新后模型选择丢失【高】

- 位置：`src/components/ModelSelector.tsx:20-23`
- 现象：用户上次选的 Claude，刷新后第一条消息仍以 GPT-5.4（DEFAULT_MODEL）发送，必须再点一次模型才同步。
- 根因：`onMount` 中只 `setCurrentModel(saved)`，**没派发 `model-change` 事件**；`Generator.tsx:36` 的 `chatModel` 仍是 `CONFIG.DEFAULT_MODEL`。
- 修复方案：在 `onMount` 读取 saved 后同样 `window.dispatchEvent(new CustomEvent('model-change', { detail: saved }))`；或让 `Generator` 初始化时自己读 `localStorage.getItem('selected_model')`。

### Bug 2 — `saveHistoryList` 是 throttle 不是 debounce【高】

- 位置：`src/store/historyStore.ts:84`、`src/config/constants.ts:9`
- 现象：500ms 内"流式完成 → 切换历史 → 修改新会话"序列里，trailing 调用用旧会话覆盖最新写入。
- 根因：`useThrottleFn(..., 500, true, true)` 的 trailing 闭包持有触发时刻的 list snapshot，常量名却叫 `SAVE_DEBOUNCE_TIME`。
- 修复方案：换 `useDebounceFn`，或在 trailing 回调内重新读 `historyList()`。

### Bug 3 — `handleBeforeUnload` 是 async【高】

- 位置：`src/components/Generator.tsx` 中 onMount 内的 `handleBeforeUnload` 注册
- 现象：刷新/关闭时几乎一定写不进盘。
- 根因：`beforeunload` 不会等待 Promise，加之 `saveHistoryList` 还是 throttle。
- 修复方案：每次修改后同步落盘；卸载兜底改用 `pagehide` + 立即写 IndexedDB（或直接放弃这套兜底，逐次保存就够用）。

### Bug 4 — `saveOrUpdateChat` 在历史未加载完成前丢更新【中】

- 位置：`src/store/historyStore.ts:128-148`
- 现象：异步加载历史还没完成时（首屏刷新很快），用户立即发消息走 `existingId` 分支，`map` 找不到目标，返回的 `updatedList` 不含该会话，update 被静默丢弃。
- 根因：`historyStore.ts:80-82` 模块初始化时异步 `loadHistoryFromStorage`，没有 ready 信号。
- 修复方案：在 `existingId` 分支找不到目标 id 时回退到 push 分支；或暴露一个 `ready` Promise 让调用方 await。

### Bug 5 — `thinkTagParser.ts` 是僵尸代码【低】

- 位置：`src/utils/thinkTagParser.ts`
- 现象：全仓库零引用（已 grep 确认 `createThinkTagParser` 只在自身文件出现）。
- 修复方案：直接删整个文件。

### Bug 6 — 触顶轮 `tool_choice: 'none'` 失效【低】

- 位置：`src/pages/api/generate.ts:229` 附近、`src/utils/openAI.ts:114`
- 现象：触顶轮虽改流式，但 `tool_choice: 'none'` 被丢弃（仅在传 `tools` 时才一起拼入 payload）。
- 实际影响：因为没传 tools 字段就无 tool 可调，行为上 OK；属"意图与实现不符"。
- 修复方案：要么显式构造 `{ tool_choice: 'none' }` 不依赖 tools 存在；要么连 `toolChoice` 都不传。

### Bug 7 — `stopStreamFetch` 与 `archiveCurrentMessage` 竞态【低】

- 位置：`src/components/Generator.tsx` stopStreamFetch / archiveCurrentMessage 路径
- 现象：极端情况下可能出现重复持久化片段或半句被存。
- 根因：`controller().abort()` 抛 `AbortError` 进 reader catch 后会再次 `setLoading(false) / return`，与外部立即调用的 archive 没有 finally 集中。
- 修复方案：用 `try { ... } finally { archive() }` 把"归档 + 关流"收敛到一处。

### Bug 8 — `readFileAsBase64` 50MB 文件内存峰值过高【中】

- 位置：`src/utils/fileUtils.ts` 的 `readFileAsBase64`、`src/components/FileAttachments.tsx` 的 `createBlobFromAttachment`
- 现象：读 50MB 文件峰值 ≈ 200MB；`atob` 复制还会再翻一倍并冻 UI。
- 修复方案：非图片 base64 限制更小（如 5MB），或换 `readAsArrayBuffer` + 流式 base64。

### Bug 9 — 代码与 CLAUDE.md 严重不符【中】

- 位置：`src/config/constants.ts:17`、`src/config/constants.ts:67-74` vs `CLAUDE.md`
- 现象：
  - `DEFAULT_MODEL = 'gpt-5.4'`，CLAUDE.md 写 `'gpt-5-chat'`。
  - `AVAILABLE_MODELS` 现为 GPT-5.4 / Claude-4.6 / Gemini-3.1-Pro / GLM-5.1 / DeepSeek-V4-Pro 共 5 个；CLAUDE.md 列了 9 个不同名字。
- 修复方案：两边必须对齐其中一处（推荐让文档对齐代码）。

---

## 四、可维护性气味

- `Generator.tsx` 中 `setCurrentAssistantMessage('') / Think('') / Tool('')` 三处重复，应封 `resetStreamingBuffers()`。
- `historyStore.ts:46-54` catch 内重复了 try 内的 fallback 读取逻辑。
- `openAI.ts` 的 `generatePayload` / `generatePayloadRaw` 仅差一步 transform，应合并加 `pretransformed` 选项。
- magic number 散落各处：`historyStore.ts:92` `Math.random() < 0.1`、各种 `setTimeout(..., 100)`，应进 constants。
- `Generator.tsx` 残留空函数 `copyMessage(_content)` 及对应 prop 链路，可整条删。

---

## 五、优先修复 Top 5（按 ROI）

1. ✅ **修 ModelSelector 启动同步**（Bug 1）：一行 dispatch 解决用户每次刷新都踩到的问题。
2. ✅ **`useThrottleFn` 改 `useDebounceFn` 并消除 trailing 覆盖**（Bug 2）：消除"切换会话覆盖"的隐性数据丢失。
3. ✅ **`saveOrUpdateChat` 未命中 id 时回退 push**（Bug 4）：补一行 fallback，刷新后立即发消息的场景就不会丢。
4. ✅ **同步 `constants.ts` 与 CLAUDE.md 的模型清单 / 默认值**（Bug 9）：避免后续基于错误文档继续改动。
5. ✅ **拆 `Generator.tsx` + 删 `thinkTagParser.ts` + 合并 `generatePayload*`**（一、Bug 5、§四）：一次性把最重的可维护性负债降下去。
   - ✅ 已删 `thinkTagParser.ts`
   - ✅ 已合并 `generatePayload*` 为 `generatePayload` + `pretransformed`
   - ✅ `Generator.tsx` → `ChatRoot.tsx`，拆出 `useChatStream` / `useHistoryPersist` / `useExportMenu`

---

## 六、调整进度跟踪

> 进度汇总（截至 2026-05-31）：共 21 项，全部完成。
> 本轮已完成：命名 10 / 12 / 13 / 14 / 15 / 16 / 18、重构 19、清理 21。先前完成：Bug 1–9，命名 11 / 17，重构 20。

| 序号 | 项目 | 状态 | 备注 |
|---|---|---|---|
| 1 | Bug 1 — ModelSelector 启动同步 | ✅ | onMount 中补 dispatch `model-change` |
| 2 | Bug 2 — throttle 改 debounce | ✅ | 改用 `useDebounceFn`，trailing 重新读 `historyList()` |
| 3 | Bug 3 — beforeunload async | ✅ | 改用 `pagehide` + 同步 sessionStorage；历史已逐次落盘 |
| 4 | Bug 4 — saveOrUpdateChat 回退 push | ✅ | 未命中 `existingId` 时降级到新增分支 |
| 5 | Bug 5 — 删除 thinkTagParser.ts | ✅ | 已删除 |
| 6 | Bug 6 — tool_choice 触顶轮 | ✅ | `generatePayload` 中 `tool_choice` 与 `tools` 解耦 |
| 7 | Bug 7 — stop/archive 竞态 finally | ✅ | `requestWithLatestMessage` try/finally 收敛归档，`stopStreamFetch` 仅 abort |
| 8 | Bug 8 — base64 大文件内存 | ✅ | 非图片二进制限 5MB（`MAX_BINARY_FILE_SIZE`），`atob` 分块解码 |
| 9 | Bug 9 — 文档与常量对齐 | ✅ | CLAUDE.md 模型清单/默认值对齐 constants.ts |
| 10 | 命名：`utils/openAI.ts` → `chatCompletion.ts` | ✅ | 已重命名 |
| 11 | 命名：删 `utils/thinkTagParser.ts`（与 Bug 5 重叠） | ✅ | 已删 |
| 12 | 命名：`Generator.tsx` → `ChatRoot.tsx` | ✅ | 已随拆分一起改名 |
| 13 | 命名：`historyState` 改为全部具名导出 | ✅ | 直接 `export { historyList, loadHistoryFromStorage }` |
| 14 | 命名：`ChatMessage.tool` → `toolTrace` | ✅ | 类型与所有引用同步重命名 |
| 15 | 命名：`MAX_HISTORY_MESSAGES` → `CONTEXT_WINDOW_SIZE` | ✅ | 已重命名 |
| 16 | 命名：`MAX_HISTORY_COUNT` → `HISTORY_LIST_LIMIT` | ✅ | 已重命名 |
| 17 | 命名：`SAVE_DEBOUNCE_TIME` → `SAVE_THROTTLE_MS`（若保留 throttle） | ✅ | Bug 2 已改回 debounce，名字 `SAVE_DEBOUNCE_TIME` 已与实现一致，无需重命名 |
| 18 | 命名：`utils/chatSession.ts` → `currentChatStore.ts` | ✅ | 已重命名 |
| 19 | 拆分 Generator.tsx | ✅ | 拆出 `useChatStream` / `useHistoryPersist` / `useExportMenu` |
| 20 | 合并 generatePayload* | ✅ | 统一为 `generatePayload` + `pretransformed` 选项 |
| 21 | 清理 magic number / 僵尸代码 | ✅ | `HISTORY_CLEANUP_PROBABILITY` / `LOAD_SCROLL_DELAY` 进 constants；删 `copyMessage` 空函数链路 |
