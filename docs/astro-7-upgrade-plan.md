# Astro 7 升级归档

本文档记录 Chat Mini 从 `astro@5.18.2` 升级到 `astro@7.0.6` 的目标、影响范围、最终改动和验证结果。升级已完成，Docker 启动后经用户测试未发现问题。

调研时间：2026-07-07
执行时间：2026-07-07

## 执行结果

- 已升级 `astro@7.0.6`、`@astrojs/node@11.0.2`、`@astrojs/vercel@11.0.2`、`@astrojs/solid-js@7.0.1`。
- 已重新生成 `pnpm-lock.yaml`。
- 已通过 `pnpm lint`、`pnpm build`、`pnpm build:vercel`、`pnpm audit --prod`。
- `@vite-pwa/astro@1.2.0` 仍只声明支持 Astro 1-5，`pnpm peers check` 会保留 peer 警告；当前构建未受影响。
- 本地终端当前是 Node.js 26，执行 pnpm 命令会提示不匹配；项目、Docker 和 Vercel 目标仍是 Node.js 24。
- `@vercel/routing-utils` 的 `path-to-regexp@6.1.0` 漏洞已通过 `pnpm-workspace.yaml` override 固定到 `6.3.0`。

## 升级结论

- 已直接升级到 Astro 7，没有单独落地 Astro 6。
- 本项目 Astro 用法较轻，主要是页面、Layout、Solid 组件、API Route、Node standalone 和 Vercel Serverless adapter，未使用 server islands、`server:defer`、Content Collections、Astro Image 等高迁移成本能力。
- Astro 7 的主要变化集中在构建工具链：Astro 7、官方 adapter 11.x、Solid 集成 7.x、Vite 8。
- `@vite-pwa/astro@1.2.0` 未声明支持 Astro 6/7，但当前 PWA 不是核心使用路径，影响范围较低。升级时先保留现状，后续等插件补齐兼容声明或项目真正需要 PWA 深度验证时再处理。
- Node 运行时统一为 Node.js 24：本地、Docker、Vercel Serverless 保持一致。

## 目标版本

| 依赖 / 运行时 | 当前版本 | 目标版本 |
| :--- | :--- | :--- |
| `astro` | `5.18.2` | `7.0.6` |
| `@astrojs/node` | `9.5.5` | `11.0.2` |
| `@astrojs/vercel` | `8.2.11` | `11.0.2` |
| `@astrojs/solid-js` | `5.1.3` | `7.0.1` |
| `solid-js` | `1.9.14` | 保持 `1.9.14`，按 peer 需要再调整 |
| `@vite-pwa/astro` | `1.2.0` | 暂时保持 `1.2.0` |
| Docker Node | `node:24-alpine` | 保持 `node:24-alpine` |
| Vercel Node | Node.js 24 | 保持 Node.js 24 |
| 本地 Node | Node.js 24 | 保持 Node.js 24 |

## 运行时统一

已统一的仓库配置：

- `package.json`：通过 `engines.node` 声明 `24.x`
- `.node-version`：声明 `24`
- `Dockerfile`：builder 和 runtime 均使用 `node:24-alpine`
- `Dockerfile.dev`：使用 `node:24-alpine`
- Vercel：项目设置已切换到 Node.js 24

## 实际改动

### 1. 升级 Astro 主链路

- 升级 `astro` 到 `7.0.6`
- 升级 `@astrojs/node` 到 `11.0.2`
- 升级 `@astrojs/vercel` 到 `11.0.2`
- 升级 `@astrojs/solid-js` 到 `7.0.1`
- 重新生成 `pnpm-lock.yaml`

### 2. 保持现有配置形态

- `output: 'server'` 保持不变
- `node({ mode: 'standalone' })` 保持不变
- `OUTPUT=vercel astro build` 保持不变
- Vercel 继续使用 Serverless，不回到 Edge
- Netlify 继续不支持

### 3. PWA 暂缓深度处理

- 保留 `@vite-pwa/astro@1.2.0`
- 保留现有 `AstroPWA` 配置
- 若安装或构建出现 peer 警告，先记录为已知风险；只有构建失败或运行时明显异常时再处理
- 后续可单独评估替换或等待 `@vite-pwa/astro` 发布支持 Astro 7 的版本

## 风险评估

### 低风险

- API Route 已使用 Astro 3+ 的大写 `POST` 导出，不需要迁移。
- 项目没有复杂 `.astro` 动态路由和预渲染逻辑。
- 服务端请求链使用 `undici` 和 `ProxyAgent`，不依赖 Edge runtime。
- Solid 业务代码主要在客户端组件内，受 Astro 主版本影响较小。

### 中风险

- Astro 7 切到 Vite 8，可能影响 UnoCSS、PWA 插件或构建产物。
- `@vite-pwa/astro@1.2.0` peer 未覆盖 Astro 7，可能出现 peer 警告或构建兼容问题。
- Vercel adapter 11.x 可能改变产物结构，需要重新跑 `pnpm build:vercel` 并检查 `.vercel/output`。

### 已知残留

- `@astrojs/vercel` 依赖链仍可能带入 `@vercel/routing-utils`，其内部包含 `path-to-regexp@6.1.0`。升级 Astro 7 不保证 `pnpm audit --prod` 完全清零。
- 若 audit 仍报 `path-to-regexp`，再单独评估是否通过 `pnpm-workspace.yaml` overrides 处理。

## 验证清单

已执行：

- `pnpm install`
- `pnpm lint`
- `pnpm build`
- `pnpm build:vercel`
- `pnpm audit --prod`
- `pnpm list astro @astrojs/node @astrojs/vercel @astrojs/solid-js --depth 1`
- Docker 构建、启动和页面回归由用户完成，当前未发现问题

手动回归重点：

- 首页正常加载
- 密码页正常跳转
- 普通聊天流式输出
- 联网搜索 Agent + Tavily
- `HTTPS_PROXY`
- Markdown、代码高亮、表格和 KaTeX
- `<think>` 折叠
- 搜索过程折叠面板
- 文件上传和拖拽上传
- 历史保存和对话导出
- temperature 滑块
- Docker 构建和启动
- Vercel 预览部署

PWA 回归放到低优先级：

- manifest 是否生成
- service worker 是否生成
- 安装入口是否仍可用

## 回滚策略

当前升级已完成且构建验证通过，暂无回滚需求。若后续发现 Astro 7、Vite 8 或 PWA 兼容问题，优先做小范围修复；若无法稳定构建，再回退到升级前的 Astro 5 基线，或临时选择 Astro 6.4.x 作为过渡版本。

## 参考

- Astro 7 npm 元数据：`astro@7.0.6`
- Node adapter npm 元数据：`@astrojs/node@11.0.2`
- Vercel adapter npm 元数据：`@astrojs/vercel@11.0.2`
- Solid adapter npm 元数据：`@astrojs/solid-js@7.0.1`
- 当前 Astro 5 升级记录：`docs/astro-upgrade-evaluation.md`
