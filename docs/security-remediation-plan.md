# 安全修复清单

本文档用于记录当前仓库已确认的安全问题、风险判断、修复优先级与执行顺序，避免后续重复排查。

## 当前结论

- GitHub / OSV 返回的安全告警很多，但不是每一条都对当前项目构成真实利用面。
- 当前最值得优先处理的是：`markdown-it`、`katex`、`undici`、`astro` 升级链路。
- 其中 `astro` 相关告警数量最多，但多数属于“版本命中”，不等于“当前代码已可利用”。
- 已处理一项：`GHSA-8hv8-536x-4wqp`，通过本地补丁修复 Astro slot name 反射型 XSS。
- P1 已完成：`markdown-it` 已升级到 `14.2.0`，KaTeX 渲染链已切到顶层 `katex@0.16.47`，并移除存在高危告警的 `markdown-it-katex`。

## 已完成

### 1. Astro reflected XSS via unescaped slot name

- Advisory: `GHSA-8hv8-536x-4wqp`
- 状态：已修复
- 处理方式：
  - 在 `package.json` 中添加 `pnpm.patchedDependencies`
  - 新增 `patches/astro@2.7.0.patch`
- 说明：
  - 这是依赖层真实存在的问题。
  - 当前仓库已通过本地补丁止血，但这不是长期方案，后续仍应升级 Astro。

### 2. P1：升级 markdown-it

- 状态：已完成
- 原版本：`13.0.1`
- 当前版本：`14.2.0`
- 原因：
  - 命中公开 ReDoS / 复杂度 DoS 漏洞
  - 项目实际会把用户消息和模型返回内容送入 Markdown 渲染
- 相关代码：
  - `src/components/MessageItem.tsx`
- 验证：
  - `pnpm list markdown-it katex markdown-it-katex --depth 4`
  - P1 相关 `pnpm audit --prod --json` 过滤结果为空

### 3. P1：升级 KaTeX 渲染链

- 状态：已完成
- 原版本：`0.16.7`
- 当前版本：`0.16.47`
- 原因：
  - 命中多条公开漏洞
  - 当前项目实际启用了公式渲染，输入面与 Markdown 渲染链一致
- 处理方式：
  - 移除 `markdown-it-katex@2.0.3`，避免运行时继续加载其嵌套的 `katex@0.6.0`
  - 新增本地轻量插件 `src/utils/markdownKatex.ts`，直接调用顶层 `katex@0.16.47`
- 相关代码：
  - `src/components/MessageItem.tsx`
  - `src/utils/markdownKatex.ts`
  - `src/pages/index.astro`
- 验证：
  - `pnpm list markdown-it katex markdown-it-katex --depth 4` 只显示 `markdown-it@14.2.0` 和 `katex@0.16.47`
  - 仓库中不再存在 `markdown-it-katex` 和 `katex@0.6.0`
  - P1 相关 `pnpm audit --prod --json` 过滤结果为空

## 待处理项

### P2：升级 undici

- 当前版本：`5.29.0`
- 建议版本：`6.27.0` 或更高
- 原因：
  - OSV 中有多条 5.x 命中的请求走私、响应队列污染、Header 注入、DoS 类问题
  - 项目服务端 API 直接使用 `undici` 的 `fetch`
- 相关代码：
  - `src/pages/api/generate.ts`
  - `src/utils/tavily.ts`
- 风险判断：
  - 当前代码没有明显使用 WebSocket / upgrade 等高风险接口
  - 但属于服务端基础网络库，仍建议尽快升级

### P2：梳理 pnpm / 锁文件 / 安装环境

- 当前现象：
  - `package.json` 声明 `pnpm@7.28.0`
  - `pnpm audit` 本地执行报 `ERR_INVALID_THIS`
  - 当前安装结果与声明版本链存在不一致
- 风险判断：
  - 这不是直接安全漏洞
  - 但会阻碍后续依赖升级、审计和验证
- 建议：
  - 明确项目应使用的 pnpm 主版本
  - 统一锁文件与实际安装环境

### P3：统一处理 Astro 安全升级

- 当前实际版本：`2.10.15`
- 当前策略：局部补丁止血
- 风险判断：
  - Astro 相关 advisory 数量较多
  - 但当前项目并未命中其中许多漏洞的触发条件
- 当前未见的触发面：
  - 自定义预渲染 `404/500`
  - `middleware`
  - `image.remotePatterns`
  - server islands / `server:defer`
- 建议：
  - 不再继续堆零散补丁
  - 单独开一次 Astro 大版本升级评估与迁移

## 当前可暂缓项

### GHSA-2pvr-wf23-7pc7

- 标题：Host header SSRF in prerendered error page fetch
- 状态：暂缓
- 原因：
  - 当前仓库没有自定义预渲染 `404/500` 页面
  - 当前代码不满足 advisory 的关键触发条件

### Solid.js JSX Fragment XSS

- Advisory: `GHSA-3qxh-p7jc-5xh6`
- 状态：暂缓观察
- 原因：
  - 当前仓库未发现明显通过 JSX Fragment 直接输出不可信 HTML 的路径
  - 当前更敏感的输入面在 Markdown / KaTeX 渲染链，而不是这条 advisory 描述的典型场景

## 建议执行顺序

1. 升级 `undici`
2. 统一 `pnpm` 与锁文件环境
3. 单独规划 Astro 升级

## 执行注意事项

- 每次升级尽量只动一小组依赖，避免把安全修复和大规模重构混在一起。
- 优先验证消息渲染链：
  - 普通 Markdown
  - 代码块高亮
  - 数学公式
  - 流式输出中的轻量渲染
- 升级 `undici` 后重点验证：
  - OpenAI 请求
  - Tavily 搜索请求
  - 代理配置 `HTTPS_PROXY`
- Astro 升级建议单开分支处理，不与日常小修复混提。

## 后续行动

- 第一批 `markdown-it` + `katex` 已完成。
- 第二批处理：`undici` + `pnpm` 环境整理。
- 第三批处理：Astro 升级评估与迁移。

## 参考来源

### 已确认的 Astro 相关来源

- `GHSA-8hv8-536x-4wqp`
  - 标题：Astro: Reflected XSS via unescaped slot name
  - 链接：<https://github.com/advisories/GHSA-8hv8-536x-4wqp>
- `GHSA-2pvr-wf23-7pc7`
  - 标题：Astro: Host header SSRF in prerendered error page fetch
  - 链接：<https://github.com/advisories/GHSA-2pvr-wf23-7pc7>

### 本轮重点参考的 OSV 条目

- `markdown-it`
  - `GHSA-38c4-r59v-3vqw`
    - 链接：<https://osv.dev/vulnerability/GHSA-38c4-r59v-3vqw>
  - `GHSA-6v5v-wf23-fmfq`
    - 链接：<https://osv.dev/vulnerability/GHSA-6v5v-wf23-fmfq>
- `katex`
  - `GHSA-3wc5-fcw2-2329`
    - 链接：<https://osv.dev/vulnerability/GHSA-3wc5-fcw2-2329>
  - `GHSA-64fm-8hw2-v72w`
    - 链接：<https://osv.dev/vulnerability/GHSA-64fm-8hw2-v72w>
  - `GHSA-cg87-wmx4-v546`
    - 链接：<https://osv.dev/vulnerability/GHSA-cg87-wmx4-v546>
  - `GHSA-cvr6-37gx-v8wc`
    - 链接：<https://osv.dev/vulnerability/GHSA-cvr6-37gx-v8wc>
  - `GHSA-f98w-7cxr-ff2h`
    - 链接：<https://osv.dev/vulnerability/GHSA-f98w-7cxr-ff2h>
- `undici`
  - `GHSA-2mjp-6q6p-2qxm`
    - 链接：<https://osv.dev/vulnerability/GHSA-2mjp-6q6p-2qxm>
  - `GHSA-35p6-xmwp-9g52`
    - 链接：<https://osv.dev/vulnerability/GHSA-35p6-xmwp-9g52>
  - `GHSA-4992-7rv2-5pvq`
    - 链接：<https://osv.dev/vulnerability/GHSA-4992-7rv2-5pvq>
  - `GHSA-g8m3-5g58-fq7m`
    - 链接：<https://osv.dev/vulnerability/GHSA-g8m3-5g58-fq7m>
  - `GHSA-g9mf-h72j-4rw9`
    - 链接：<https://osv.dev/vulnerability/GHSA-g9mf-h72j-4rw9>
  - `GHSA-p88m-4jfj-68fv`
    - 链接：<https://osv.dev/vulnerability/GHSA-p88m-4jfj-68fv>
  - `GHSA-v9p9-hfj2-hcw8`
    - 链接：<https://osv.dev/vulnerability/GHSA-v9p9-hfj2-hcw8>
  - `GHSA-vrm6-8vpv-qv8q`
    - 链接：<https://osv.dev/vulnerability/GHSA-vrm6-8vpv-qv8q>
  - `GHSA-vxpw-j846-p89q`
    - 链接：<https://osv.dev/vulnerability/GHSA-vxpw-j846-p89q>
- `solid-js`
  - `GHSA-3qxh-p7jc-5xh6`
    - 链接：<https://osv.dev/vulnerability/GHSA-3qxh-p7jc-5xh6>

### 本轮判断所依据的本地代码位置

- Markdown / KaTeX 渲染入口：
  - `src/components/MessageItem.tsx`
- 服务端网络请求入口：
  - `src/pages/api/generate.ts`
  - `src/utils/tavily.ts`
- 页面模板与 `set:html` 使用位置：
  - `src/layouts/Layout.astro`
