# 安全修复清单

本文档用于记录当前仓库已确认的安全问题、风险判断、修复优先级与执行顺序，避免后续重复排查。

## 当前结论

- GitHub / OSV 返回的安全告警很多，但不是每一条都对当前项目构成真实利用面。
- 当前最值得优先处理的是：`markdown-it`、`katex`、`undici`、`astro` 升级链路。
- 其中 `astro` 相关告警数量最多，但多数属于“版本命中”，不等于“当前代码已可利用”。
- 已处理一项：`GHSA-8hv8-536x-4wqp`，通过本地补丁修复 Astro slot name 反射型 XSS。
- P1 已完成：`markdown-it` 已升级到 `14.2.0`，KaTeX 渲染链已切到顶层 `katex@0.16.47`，并移除存在高危告警的 `markdown-it-katex`。
- P2 已完成：项目直接依赖和 Astro 传递依赖中的 `undici` 已统一到 `6.27.0`，安装环境已统一到 `pnpm@11.7.0`。

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

### 4. P2：升级 undici

- 状态：已完成
- 原版本：直接依赖 `5.22.1`，Astro 传递依赖中存在 `5.22.1`
- 当前版本：`6.27.0`
- 原因：
  - OSV 中有多条 5.x 命中的请求走私、响应队列污染、Header 注入、DoS 类问题
  - 项目服务端 API 直接使用 `undici` 的 `fetch`
- 处理方式：
  - 将 `package.json` 直接依赖 `undici` 升级到 `6.27.0`
  - 在 `pnpm-workspace.yaml` 中通过 `overrides.undici` 统一传递依赖版本，避免 Astro 旧依赖链继续锁在 5.x
- 相关代码：
  - `src/pages/api/generate.ts`
  - `src/utils/tavily.ts`
- 验证：
  - `pnpm list undici --depth 4` 显示所有路径均为 `undici@6.27.0`
  - `pnpm build` 通过
  - `pnpm audit --prod --json` 输出中不再包含 `undici` 告警

### 5. P2：统一 pnpm / 锁文件 / 安装环境

- 状态：已完成
- 当前版本：`pnpm@11.7.0`
- 处理方式：
  - `package.json` 保持 `packageManager: pnpm@11.7.0`
  - `pnpm-lock.yaml` 保持 lockfile v9，并由 `pnpm@11.7.0` 重新生成
  - Docker 构建镜像和开发镜像中的全局 pnpm 版本统一为 `11.7.0`
- 验证：
  - `pnpm --version` 输出 `11.7.0`
  - `pnpm install` 可正常同步安装结果
  - `pnpm audit --prod --json` 可正常执行；仍有非 undici 告警，归入后续 Astro / Solid / Zag 等升级批次

## 待处理项

### P3：统一处理 Astro 安全升级

- 当前实际版本：`2.7.0`（带本地补丁）。
  - 注：本节此前记录的 `2.10.15` 有误，`package.json` / `pnpm-lock.yaml` / `patches/astro@2.7.0.patch` 三处一致为 `2.7.0`。
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
- **评估进展（已完成评估文档）**：
  - 详见 `docs/astro-upgrade-evaluation.md`
  - 目标版本：**Astro 5.x（5.18.2）**（求稳，PWA 官方支持、Node 底线宽、Vite 只到 6）
  - 仅保留 Vercel + Node/Docker，移除 Netlify
  - Vercel 从 edge 迁到 serverless，顺带可删 `disableBlocks` hack 并让 `HTTPS_PROXY` 在 Vercel 生效
  - 无阻塞级风险；剩余主要是 Zag slider 重写与 UnoCSS 视觉漂移，均可控
  - 本轮仅交付评估，未改代码
- **落地进展**：
  - 批次 A（移除 Netlify）✅ 已完成（2026-07-06）：删除 `@astrojs/netlify` 依赖与 `build:netlify` 脚本、`netlify.toml`、`astro.config.mjs` 的 netlify 分支、ignore 残留，并同步 README/CLAUDE/AGENTS/GEMINI 文档。已通过 Node + Vercel edge 双构建验证。
  - 批次 B（折叠 C+E，Astro 5 + UnoCSS 66 + PWA 1.x + Solid 1.9）✅ 已完成（2026-07-06）：升级 astro@5.18.2、@astrojs/node@9.5.5、@astrojs/vercel@8.2.11(serverless)、@astrojs/solid-js@5.1.3、solid-js@1.9.14、unocss@66.7.4、@vite-pwa/astro@1.2.0；删除 astro@2.7.0 本地补丁与 `disableBlocks` 插件；Vercel 从 edge 迁到 serverless，`HTTPS_PROXY` 在 Vercel 上生效；API 方法名大写(`POST`)；`presetUno` 改名 `presetWind3`。已通过 Node + Vercel serverless 双构建 + lint + 关键路径回归。**注**：Astro 5 线未修复部分 6.x+ advisory(define:vars XSS、server islands DoS、x-astro-path override 等)，但项目未使用这些功能，无实际利用面。
  - 批次 D–F（Zag slider / 工具链）：待处理。

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

1. 单独规划 Astro 升级
2. 评估 Solid / Seroval / Zag 升级链路
3. 评估 Vite / esbuild / adapter 传递依赖告警

## 执行注意事项

- 每次升级尽量只动一小组依赖，避免把安全修复和大规模重构混在一起。
- 优先验证消息渲染链：
  - 普通 Markdown
  - 代码块高亮
  - 数学公式
  - 流式输出中的轻量渲染
- 后续升级 Astro / adapter 后重点验证：
  - OpenAI 请求
  - Tavily 搜索请求
  - 代理配置 `HTTPS_PROXY`
  - Docker 构建与运行
- Astro 升级建议单开分支处理，不与日常小修复混提。

## 后续行动

- 第一批 `markdown-it` + `katex` 已完成。
- 第二批 `undici` + `pnpm` 环境整理已完成。
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
