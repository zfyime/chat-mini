# P3：Astro 升级评估

本文件是安全修复清单 P3 的独立评估，对应 `docs/security-remediation-plan.md` 中「待处理项 → P3」。目标是把当前锁死在 `astro@2.7.0` + 本地补丁的止血方案，替换为一次干净的大版本升级，从根上消除 Astro 相关 advisory，并顺带清理整条落后 2-3 年的构建链。

本轮仅交付评估，不改代码。落地实现另开分支。

调研时间：2026-07-06。版本结论已用 npm 包元数据和 Astro 官方文档重新核对。

## 一、基线现状（含事实纠正）

- **事实纠正**：安全清单 P3 写「当前实际版本：`2.10.15`」不准确。`package.json`、`pnpm-lock.yaml`、本地补丁 `patches/astro@2.7.0.patch` 三处一致，**实际基线是 `astro@2.7.0`**（带本地 XSS 补丁）。后续评估与安全清单均应以 2.7.0 为准。

当前整条构建/运行链版本，以及本次升级的目标版本（**Astro 5 线**，非绝对最新的 7.x）：

| 依赖 | 当前 | 目标（Astro 5 线） | 说明 |
| :--- | :--- | :--- | :--- |
| `astro` | 2.7.0（打补丁） | 5.18.2 | 跨 3 个大版本 |
| `@astrojs/node` | 5.3.0 | 9.5.5 | peer `astro@^5.17.3` |
| `@astrojs/vercel` | 3.5.0（edge 入口） | 8.2.11 | peer `astro@^5`；**edge 入口已移除** |
| `@astrojs/netlify` | 2.3.0（edge-functions） | 移除 | 本项目不再使用，整体删除 |
| `@astrojs/solid-js` | 2.2.0 | 5.1.3 | peer `solid-js@^1.8.5` |
| `solid-js` | 1.7.6 | 1.8.x | 随适配器抬升（小版本演进） |
| `@vite-pwa/astro` | 0.1.1 | 1.2.0 | peer 含 `astro@^5`，**官方支持** |
| `unocss` / `@unocss/reset` | 0.50.8 | 66.7.4 | 跨大版本，含配置/预设变更 |
| `@zag-js/slider` / `@zag-js/solid` | 0.16.0 | 1.42.x | API 破坏性变更（滑块组件） |
| `vite`（Astro 内置） | 4.x | 6.x | 由 Astro 5 决定，不直接锁 |
| `eslint-plugin-astro` / `@typescript-eslint/*` | 0.27 / 5.60 | 需同步 | 适配新 Astro 语法与 TS |

> 选择 Astro 5 而非 7 的理由：截至 2026-07-06，`astro` 最新为 `7.0.6`，Node 底线已抬到 `>=22.12.0`；而 `@vite-pwa/astro@1.2.0` 官方 peer 只到 `astro@^5`。5 线能让 PWA 保持官方支持，同时 edge 适配器在 Astro 5 已移除，安全面与迁移收益与 7 线一致，但 Node 底线更宽、Vite 只到 6，整体更稳。

关键架构事实（决定迁移面）：

- `astro.config.mjs` 用 `output: 'server'`，三套适配器按 `process.env.OUTPUT` 切换：`vercel()`（edge）/`netlify()`（edge）/`node({ mode: 'standalone' })`。
- `plugins/disableBlocks.js` 在 vercel/netlify 构建时用正则删掉 `generate.ts` 里 `#vercel-disable-blocks … #vercel-end` 之间的 `undici` `ProxyAgent` 引入——因为旧 edge 运行时没有 undici。**代价：`HTTPS_PROXY` 代理目前只在 Node/Docker 生效，Vercel/Netlify 上被静默剥离。**
- `.astro` 文件 7 个，`set:html` 仅在 `Layout.astro` 用于注入 `HEAD_SCRIPTS` 和 PWA 的 manifest/registerSW 标签，输入均为可信来源。
- 服务端 API 仅 `generate.ts`、`auth.ts`，均 `import type { APIRoute } from 'astro'`，未用 middleware / 自定义预渲染 404·500 / `image.remotePatterns` / server islands。

## 二、目标与约束（已确认）

- **目标版本**：**Astro 5.x（当前 5.18.2）**。这是 Astro 5 线的最新版本，不是全量最新版本。
- **部署目标收敛**：只保留 **Vercel + Node/Docker**，**整体移除 Netlify**（适配器、`netlify.toml`、config 中的 netlify 分支、disableBlocks 的 netlify 判断一并删除）。这是本次能大幅缩小迁移面的关键决定。
- **运行时底线**：Astro 5 `engines.node = "18.20.8 || ^20.3.0 || >=22.0.0"`，比 7 线宽松：
  - Docker `node:20-alpine` **可保留**（只需 ≥ 20.3，20.x 最新镜像满足），无强制抬到 22；如求稳可顺手升 `node:22-alpine`，非必须。
  - 本地 Node 26，满足。
  - Netlify 的 `NODE_VERSION=18` 随 Netlify 移除而消失（18.20.8 以下本就不达标，正好一并了断）。

## 三、破坏性变更清单（按模块）

### 1. 适配器：Vercel edge → serverless（头等改动）

- Astro 5 起 `@astrojs/vercel/edge` 入口被移除，统一到 `@astrojs/vercel`（默认 serverless，Node 运行时；edge 能力改由 `edgeMiddleware` 选项提供）。
- `astro.config.mjs` 需改：`import vercel from '@astrojs/vercel/edge'` → `import vercel from '@astrojs/vercel'`。
- **连带收益**：serverless 是 Node 运行时，`undici` + `ProxyAgent` 原生可用 → `plugins/disableBlocks.js` 整个插件、以及 `generate.ts` 里 `#vercel-disable-blocks / #vercel-end` 标记**都可删除**，且 `HTTPS_PROXY` 从此在 Vercel 上也能生效（当前是被剥离的）。这是一处「升级顺带修好一个隐性缺陷」。
- **行为差异需验证**：edge → serverless 的冷启动、流式响应（`ReadableStream` SSE）、超时上限、区域路由都可能变化。`generate.ts` 的流式 + agent 多轮逻辑是重点回归对象。

### 2. Netlify：整体移除

- 删除 `@astrojs/netlify` 依赖、`netlify.toml`、`astro.config.mjs` 的 netlify 分支与 import、`disableBlocks` 的 netlify 命中判断、README/CLAUDE.md 中 Netlify 部署段落（文档同步）。

### 3. Node 适配器与 output 语义

- `@astrojs/node` 5 → 9，`node({ mode: 'standalone' })` 配置基本沿用，但需按新版校验入口产物与 `dist` 结构（Docker `COPY --from=builder /usr/src/dist ./dist` 与 entrypoint 假设不变即可）。
- Astro 5 的 `output` 语义调整（`hybrid` 合并进 `static`、prerender 默认值变化，且移除了「用环境变量动态设置 prerender」的能力）。本项目全站按需渲染、无 `hybrid`、无动态 prerender，风险低，但需确认升级后 `output: 'server'` 仍是期望语义（Astro 5 中 `server` 仍表示默认按需渲染）。

### 4. Vite 4 → 6（由 Astro 5 内置）

- 不直接在 `package.json` 锁 vite，由 Astro 决定。影响面在 `astro.config.mjs` 的 `vite` 字段：`resolve.alias`（`@` → `./src`）与自定义插件数组。alias 写法可沿用；`disableBlocks` 插件计划删除，插件数组随之清空或仅留必要项。
- UnoCSS 作为 vite 插件，其大版本必须与 Vite 6 对齐（`@unocss/astro@66` peer 已覆盖 `vite ^5||^6||^7||^8`，兼容）。

### 5. UnoCSS 0.50 → 66（大跨版本）

- `unocss` 与 `@unocss/reset` 同步升级。0.50 → 66 之间预设（`presetUno`/`presetIcons` 等）、配置结构、`@unocss/reset` 引入路径都可能变化。
- 需核对：`unocss()` 集成在 config 中的用法、项目里 UnoCSS 的 class 约定与 `@iconify-json/carbon` 图标预设是否仍按现配置工作。
- **风险中等**：属于「样式不报错但可能视觉漂移」类，验证要靠肉眼过关键页面。

### 6. Zag.js 0.16 → 1.42（滑块组件，API 破坏性）

- `@zag-js/slider` + `@zag-js/solid` 从 0.16 到 1.x 跨越极大，`machine`/`connect`/`api` 用法几乎肯定变更。
- 影响面：temperature 调节滑块组件。需按 1.x 文档重写该组件的接线代码。**这是本次唯一确定需要改业务组件代码的点。**

### 7. Solid 链

- `@astrojs/solid-js` 2 → 5，peer 要求 `solid-js@^1.8.5`，故 `solid-js` 1.7.6 → 1.8.x。Solid 1.7→1.8 属小版本演进，破坏性小，但需回归所有 `.tsx` 交互组件（消息渲染、输入框、拖拽上传、历史列表）。

### 8. PWA（Astro 5 官方支持，非阻塞）

- `@vite-pwa/astro` 0.1.1 → 1.2.0，其 peer 明确包含 `astro@^5.0.0`，**官方支持，不再是阻塞点**。
- 仍需回归：manifest 生成、`registerSW` 注入（`Layout.astro` 的 `set:html`）、安装与自动更新（`registerType: 'autoUpdate'`、`periodicSyncForUpdates`）。0.1→1.x 跨度大，配置项命名可能微调，需对照新版 README 校验 config 里的 `manifest` / `client` / `devOptions` 字段。

### 9. 本地补丁与 lint

- 升级后删除 `patches/astro@2.7.0.patch` 与 `pnpm-workspace.yaml` 的 `patchedDependencies`（`GHSA-8hv8-536x-4wqp` 已上游修复，P3 止血目标达成）。
- `pnpm-workspace.yaml` 的 `overrides.undici`、`babel-preset-solid` 需重新评估是否仍必要（新 Astro 链可能已自带较新 undici）。
- `eslint-plugin-astro` / `@typescript-eslint/*` / `@evan-yang/eslint-config` 同步升级，确保 `pnpm lint` 仍可用。

## 四、关键风险与决策点

> 选定 Astro 5 后，原「PWA 与 Astro 7 兼容缺口」这一阻塞级风险已消除。剩余风险如下，均可控。

1. **Zag slider 重写（确定改代码）**：范围局限在 temperature 滑块，按 1.x API 重写接线即可。
2. **UnoCSS 大跨版本视觉漂移**：无编译错误也可能样式变化，验证成本主要在肉眼回归关键页面。
3. **edge → serverless 运行时行为差异**：流式 SSE、超时、冷启动需在 Vercel 预览环境实测，尤其 agent 多轮 + Tavily 的长请求路径。
4. **PWA 0.1→1.x 配置迁移**：非阻塞，但跨度大，需对照新版校验 config 与安装/更新链路。

## 五、建议迁移路径（分批，勿一次性混提）

> 原则沿用安全清单：每批只动一小组依赖，先过渲染链再过网络链。

1. **批次 A — 部署面收敛（可独立先做）✅ 已落地（2026-07-06）**：移除 Netlify（依赖 + `netlify.toml` + config 分支 + ignore 残留 + 文档）。此步不依赖 Astro 升级，先落地缩小后续迁移面。已通过 `pnpm build`（Node）+ `OUTPUT=vercel astro build`（Vercel edge）双构建验证。注意：`disableBlocks` 插件与 vercel edge 判断仍保留，留待批次 B 一并删除。
2. **批次 B — Astro 核心 + 适配器**：`npx @astrojs/upgrade` 对齐 `astro@5` 与 `@astrojs/node@9`、`@astrojs/vercel@8`、`@astrojs/solid-js@5`；改 config 的 vercel 入口为 serverless；删 `disableBlocks` 插件与 `generate.ts` 的 vercel 标记；删本地 patch。
3. **批次 C — 构建链**：UnoCSS 0.50→66、`@unocss/reset` 同步；核对 vite 字段。
4. **批次 D — 组件链**：`solid-js` 抬到 1.8.x；Zag slider 0.16→1.x 重写滑块接线。
5. **批次 E — PWA**：`@vite-pwa/astro` → 1.2.0，对照新版校验 config，回归安装/更新。
6. **批次 F — 工具链与运行时**：eslint 相关升级；重估 `pnpm-workspace.yaml` overrides；如求稳可选升 Docker `node:22`。

每批后跑 `pnpm build`（Node）+ `OUTPUT=vercel astro build`（Vercel）双构建 + 关键路径回归。

## 六、验证清单（每批 + 收尾）

渲染链（本地 `pnpm dev`）：

- [ ] 普通 Markdown（表格、列表）
- [ ] 代码块高亮（`highlight.js` / `markdown-it-highlightjs`）
- [ ] 数学公式（顶层 `katex@0.16.47` + 本地插件 `src/utils/markdownKatex.ts`）
- [ ] `<think>` 折叠、流式输出中的轻量渲染
- [ ] KaTeX 与 UnoCSS 升级后**逐页肉眼回归**样式

网络/服务端链：

- [ ] OpenAI 流式请求（非联网单轮）
- [ ] 联网 agent 多轮 + Tavily 搜索面板、`<tool_data>` 回灌
- [ ] `HTTPS_PROXY` 代理：Node/Docker **及新增的 Vercel serverless** 均生效
- [ ] 访问密码 + 签名校验（`auth.ts` / `verifySignature`）

平台构建：

- [ ] `pnpm build`（Node standalone）产物可 `pnpm preview`
- [ ] `OUTPUT=vercel astro build` 通过，Vercel 预览环境流式与超时正常
- [ ] Docker（`node:20` 或选升 `node:22`）构建 + `docker-entrypoint.sh` 启动正常
- [ ] Netlify 相关物已彻底移除，无残留 import/配置

前端功能：

- [ ] 拖拽上传、文件预览、多文件
- [ ] IndexedDB 历史读写与 localStorage 降级
- [ ] 导出 Markdown/JSON/TXT
- [ ] 消息复制/删除、temperature 滑块（Zag 重写后重点测）
- [ ] PWA 安装/更新（`@vite-pwa/astro` 1.x 迁移后回归）

安全收尾：

- [ ] 删除 `patches/astro@2.7.0.patch` 与 `patchedDependencies` 后，`pnpm audit --prod --json` 中 Astro 相关 advisory 清零
- [ ] `GHSA-2pvr-wf23-7pc7`（预渲染错误页 SSRF）确认随升级失效或不触发

## 七、回滚策略

- 单开分支 `chore/astro-upgrade`，按批次小步提交，每批一个可回滚点。
- 保留当前 `2.7.0 + patch` 的 `main` 作为随时回退基线，直到 Vercel + Docker 双环境线上验证通过。
- 各批相互隔离：批次 A（移除 Netlify）与 B–F 可分阶段合并，任一批出问题不影响已验证的前序批次。

## 八、工作量与建议小结

- 这不是单纯「升 Astro」，而是**一次构建链整体现代化**：核心跨 3 个大版本，UnoCSS/Zag/Solid/PWA/Vite 全部连带。
- 收益明确：消除全部 Astro advisory、删除本地补丁与 disableBlocks hack、Vercel 上代理可用、构建链回到受支持区间，且 PWA 保持官方支持。
- 选定 Astro 5 后已无阻塞级风险，剩余最大不确定性是 **Zag slider 重写** 与 **UnoCSS 视觉漂移**，均可控。
- 建议：批次 A（移除 Netlify）可立即安全落地；批次 B–F 按序推进，每批双构建 + 回归。

## 参考来源

- Upgrade to Astro v5 — <https://docs.astro.build/en/guides/upgrade-to/v5/>
- Vercel 适配器（edge 入口移除，serverless + edgeMiddleware）— <https://docs.astro.build/en/guides/integrations-guide/vercel/>
- Netlify 适配器（edge-functions 移除）— <https://docs.astro.build/en/guides/integrations-guide/netlify/>
- `@vite-pwa/astro`（peer 覆盖 `astro@^5`）— <https://github.com/vite-pwa/astro>
- 版本与 peer 核实（2026-07-06 已执行）：
  - `pnpm view astro@5 version engines --json`：Astro 5 线最新为 `5.18.2`，Node 要求 `18.20.8 || ^20.3.0 || >=22.0.0`
  - `pnpm view astro version engines --json`：全量最新为 `7.0.6`，Node 要求 `>=22.12.0`
  - `pnpm view @astrojs/vercel@8 version peerDependencies --json`：`8.2.11` peer `astro@^5.0.0`
  - `pnpm view @astrojs/node@9 version peerDependencies --json`：`9.5.5` peer `astro@^5.17.3`
  - `pnpm view @astrojs/solid-js@5 version peerDependencies --json`：`5.1.3` peer `solid-js@^1.8.5`
  - `pnpm view @vite-pwa/astro version peerDependencies --json`：`1.2.0` peer 覆盖到 `astro@^5.0.0`，不覆盖 Astro 6/7
  - `pnpm view unocss version peerDependencies --json`：`66.7.4`
  - `pnpm view @zag-js/slider version --json`：`1.42.0`
</content>
