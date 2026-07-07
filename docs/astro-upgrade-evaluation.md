# Astro 5 升级评估与落地记录

本文档记录 Chat Mini 从 `astro@2.7.0` 升级到 `astro@5.18.2` 的评估结论和最终落地状态。升级已完成，用户已验证应用可以正常访问和使用。

调研时间：2026-07-06<br>
落地完成：2026-07-07

## 升级目标

- 用 Astro 5 替换 `astro@2.7.0` + 本地安全补丁的止血方案。
- 清理旧 Edge 运行时相关 hack。
- 删除不再维护的 Netlify 部署面。
- 保留 PWA、Solid、UnoCSS、文件上传、联网搜索和流式输出能力。

选择 Astro 5 而不是更高大版本的原因：

- Astro 5 的 Node 要求更宽，适合当前 Docker / 本地环境。
- `@vite-pwa/astro@1.2.0` 官方 peer 覆盖 Astro 5。
- Vercel Edge 入口在 Astro 5 已移除，迁移到 Serverless 后可以同步解决 `HTTPS_PROXY` 在 Vercel 不生效的问题。

## 升级前后版本

| 依赖 | 升级前 | 升级后 |
| :--- | :--- | :--- |
| `astro` | `2.7.0`（带本地补丁） | `5.18.2` |
| `@astrojs/node` | `5.3.0` | `9.5.5` |
| `@astrojs/vercel` | `3.5.0`（Edge） | `8.2.11`（Serverless） |
| `@astrojs/netlify` | `2.3.0` | 已移除 |
| `@astrojs/solid-js` | `2.2.0` | `5.1.3` |
| `solid-js` | `1.7.6` | `1.9.14` |
| `@vite-pwa/astro` | `0.1.1` | `1.2.0` |
| `unocss` / `@unocss/reset` | `0.50.8` | `66.7.4` |
| `@zag-js/slider` / `@zag-js/solid` | `0.16.0` | `1.42.0` |
| Docker Node | `node:20-alpine` | `node:22-alpine` |
| pnpm | `7.28.0` | `11.7.0` |

## 关键落地改动

### 1. Vercel Edge 改为 Serverless

- `@astrojs/vercel/edge` 改为 `@astrojs/vercel`
- `OUTPUT=vercel astro build` 生成 Vercel Serverless 产物
- 删除 `plugins/disableBlocks.js`
- 删除 `generate.ts` 中旧的 `#vercel-disable-blocks` 标记
- `HTTPS_PROXY` 现在可在 Vercel Serverless 中用于 OpenAI 和 Tavily 请求

### 2. Netlify 移除

- 删除 `@astrojs/netlify`
- 删除 `netlify.toml`
- 删除 `astro.config.mjs` 中的 Netlify 分支
- 删除文档中的 Netlify 部署说明

### 3. Astro API 兼容调整

- API 路由方法从小写导出改为大写 `POST`
- 保留 `output: 'server'`
- Node 适配器继续使用 `node({ mode: 'standalone' })`

### 4. UnoCSS 66

- 显式添加 `@unocss/astro`
- `presetUno` 迁移到 `presetWind3`
- 保留现有原子类写法，构建验证通过

### 5. PWA 1.x

- `@vite-pwa/astro` 升级到 `1.2.0`
- 保留 `registerType: 'autoUpdate'`
- 保留 inline register 和 manifest 配置

### 6. Solid 与 Zag slider

- Solid 升级到 `1.9.14`
- Zag slider 升级到 `1.42.0`
- `src/components/Slider.tsx` 按 Zag 1.x API 重写
- `src/styles/slider.css` 同步更新 anatomy part 名称

## 当前部署形态

- **本地开发**：`pnpm dev`
- **Node standalone**：`pnpm build`
- **Vercel Serverless**：`pnpm build:vercel`
- **Docker**：`docker-compose up -d --build`

不再支持 Netlify。

## 验证记录

已执行并通过：

- `pnpm install`
- `pnpm lint`
- `pnpm build`
- `OUTPUT=vercel astro build`
- `pnpm audit --prod` 中 Astro 2 补丁链、`undici`、`@zag-js`、Markdown / KaTeX 相关高优先级告警已处理

用户已完成运行时访问验证：应用可以正常访问和使用。

## 回归重点

后续每次改动仍建议重点检查：

- 普通 Markdown、表格、代码块高亮
- KaTeX 数学公式
- `<think>` 折叠和联网搜索折叠面板
- OpenAI 流式输出
- 联网搜索 Agent + Tavily
- `HTTPS_PROXY`
- 文件上传、拖拽上传、历史保存和对话导出
- temperature 滑块
- PWA 安装与更新
- Docker 构建和启动

## 已知安全判断

- Astro 5 仍可能命中部分 6.x+ advisory 的版本区间外问题描述，但当前项目没有使用其触发面，例如 server islands、`server:defer`、自定义预渲染错误页、`image.remotePatterns`。
- 如果未来启用这些 Astro 功能，需要重新评估并考虑继续升级 Astro 大版本。

## 参考来源

- Upgrade to Astro v5 — <https://docs.astro.build/en/guides/upgrade-to/v5/>
- Vercel adapter — <https://docs.astro.build/en/guides/integrations-guide/vercel/>
- `@vite-pwa/astro` — <https://github.com/vite-pwa/astro>
- 安全修复归档：`docs/security-remediation-plan.md`
