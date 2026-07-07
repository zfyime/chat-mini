# 安全修复归档

本文档记录本轮依赖安全修复、Astro 升级和构建链现代化的最终状态。当前升级已完成，用户已验证应用可以正常访问和使用。

## 当前结论

- P1、P2、P3 安全修复均已完成。
- 项目已从 `astro@2.7.0` + 本地补丁升级到 `astro@5.18.2`，并在 2026-07-07 继续升级到 `astro@7.0.6`。
- Vercel 已从 Edge 迁移到 Serverless，`HTTPS_PROXY` 在 Vercel、Node/Docker 上均可用于 OpenAI 和 Tavily 请求。
- Netlify 部署面已移除，仅保留 Vercel Serverless 和 Node/Docker。
- `markdown-it`、`katex`、`undici`、`@zag-js/*` 相关高优先级告警已通过升级或替换依赖处理。
- Docker 和 Docker dev 基础镜像已升级到 `node:22-alpine`。

## 已完成修复

### 1. Markdown 渲染链

- `markdown-it`：`13.0.1` → `14.2.0`
- `katex`：`0.16.7` → `0.16.47`
- 移除 `markdown-it-katex`，避免继续加载其嵌套的旧版 `katex@0.6.0`
- 新增本地轻量插件 `src/utils/markdownKatex.ts`，直接调用顶层 KaTeX

相关文件：

- `src/components/MessageItem.tsx`
- `src/utils/markdownKatex.ts`
- `src/pages/index.astro`

### 2. 服务端请求链

- `undici`：`5.22.1` → `6.27.0`
- 通过 `pnpm-workspace.yaml` 的 override 统一传递依赖中的 `undici` 版本
- OpenAI 和 Tavily 请求复用 `HTTPS_PROXY` 的 `ProxyAgent`

相关文件：

- `src/pages/api/generate.ts`
- `src/utils/tavily.ts`
- `pnpm-workspace.yaml`

### 3. pnpm 与锁文件

- `packageManager` 统一为 `pnpm@11.7.0`
- `pnpm-lock.yaml` 使用 lockfile v9
- Docker 构建环境中的 pnpm 同步为 `11.7.0`

### 4. Astro 5 / Astro 7 升级

- `astro`：`2.7.0` → `5.18.2`
- `astro`：`5.18.2` → `7.0.6`
- `@astrojs/node`：`5.3.0` → `9.5.5`
- `@astrojs/node`：`9.5.5` → `11.0.2`
- `@astrojs/vercel`：`3.5.0` → `8.2.11`
- `@astrojs/vercel`：`8.2.11` → `11.0.2`
- `@astrojs/solid-js`：`2.2.0` → `5.1.3`
- `@astrojs/solid-js`：`5.1.3` → `7.0.1`
- `solid-js`：`1.7.6` → `1.9.14`
- `@vite-pwa/astro`：`0.1.1` → `1.2.0`
- `unocss` / `@unocss/reset`：`0.50.8` → `66.7.4`

落地改动：

- 删除 `patches/astro@2.7.0.patch` 和 `patchedDependencies`
- 删除 `plugins/disableBlocks.js`
- Vercel 入口从 `@astrojs/vercel/edge` 改为 `@astrojs/vercel`
- API 路由方法改为 Astro 3+ 要求的大写 `POST`
- UnoCSS 预设从 `presetUno` 迁移到 `presetWind3`
- 显式添加 `@unocss/astro`
- 移除 Netlify 适配器、`netlify.toml` 和相关文档

### 5. Zag slider 升级

- `@zag-js/slider`：`0.16.0` → `1.42.0`
- `@zag-js/solid`：`0.16.0` → `1.42.0`

主要代码改动：

- `useMachine(slider.machine({ ... }))` 改为 `useMachine(slider.machine, { ... })`
- props 从属性读取改为函数调用，例如 `api().getRootProps()`
- `value` 从数字改为数组
- `onChange` 改为 `onValueChange`
- thumb 和 hidden input props 传入 `{ index: 0 }`
- `data-part='output'` 改为 `data-part='valueText'`

相关文件：

- `src/components/Slider.tsx`
- `src/styles/slider.css`
- `docs/manual-test-slider.md`

### 6. 工具链与运行时

- `eslint`：`8.43.0` → `8.57.1`
- `@typescript-eslint/parser`：`5.60.0` → `8.62.1`
- `eslint-plugin-astro`：`0.27.1` → `1.7.0`
- Docker / Docker dev 基础镜像：`node:20-alpine` → `node:22-alpine`

说明：

- 继续保留 `.eslintrc.js`，未迁移到 ESLint flat config。
- `@evan-yang/eslint-config@1.0.9` 仍绑定 ESLint 8，因此本轮没有升级到 ESLint 10。

## 当前版本基线

| 依赖 | 当前版本 |
| :--- | :--- |
| `astro` | `7.0.6` |
| `@astrojs/node` | `11.0.2` |
| `@astrojs/vercel` | `11.0.2` |
| `@astrojs/solid-js` | `7.0.1` |
| `solid-js` | `1.9.14` |
| `unocss` / `@unocss/reset` | `66.7.4` |
| `@zag-js/slider` / `@zag-js/solid` | `1.42.0` |
| `markdown-it` | `14.2.0` |
| `katex` | `0.16.47` |
| `undici` | `6.27.0` |
| `pnpm` | `11.7.0` |

## 验证记录

已执行并通过：

- `pnpm install`
- `pnpm lint`
- `pnpm build`
- `OUTPUT=vercel astro build`
- `pnpm list markdown-it katex markdown-it-katex --depth 4`
- `pnpm list undici --depth 4`
- `pnpm list @zag-js/slider @zag-js/solid @zag-js/core --depth 3`
- `pnpm audit --prod` 中 `markdown-it`、`katex`、`undici`、`@zag-js` 相关告警清零

用户已完成运行时访问验证：应用可以正常访问和使用。

## 后续关注

- Astro 7 升级已完成，相关记录见 `docs/astro-7-upgrade-plan.md`。
- 如未来启用这些 Astro 功能，需要重新做安全评估。
- Vercel Serverless 与旧 Edge 运行时的超时、冷启动和流式行为不同，长链路联网搜索仍建议在线上预览环境做回归。

## 参考文档

- Astro 升级评估与落地记录：`docs/astro-upgrade-evaluation.md`
- Zag slider 手动测试：`docs/manual-test-slider.md`
- 联网搜索 Agent：`docs/web-search-agent-plan.md`
