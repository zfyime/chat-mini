# 仓库指南

## 项目结构与模块组织
- `src/pages`：Astro 路由（如 `index.astro`、`password.astro`）。
- `src/pages/api`：服务端接口（`generate.ts` 流式对话、`auth.ts` 鉴权）。
- `src/components`：UI 组件（Solid TSX 与 Astro，如 `MessageItem.tsx`、`Header.astro`）。
- `src/config`：应用常量与模型清单（`constants.ts`）。
- `src/utils`：OpenAI 与签名工具（`openAI.ts`、`auth.ts`）。
- `public`：静态资源；根部配置：`astro.config.mjs`、`unocss.config.ts`。

## 构建、测试与开发命令
- `pnpm dev` / `pnpm start`：启动开发服务（默认 `http://localhost:4321`）。
- `pnpm build`：生产构建（默认 Node 适配器）。
- `pnpm build:vercel` / `pnpm build:netlify`：平台定制构建。
- `pnpm preview`：本地预览打包产物。
- `pnpm lint` / `pnpm lint:fix`：代码检查/自动修复。

## 代码风格与命名约定
- 语言：TypeScript + Astro + Solid。
- Lint：ESLint（扩展 `@evan-yang` 与 `plugin:astro/recommended`，见 `.eslintrc.js`）；除 `console.error` 外禁止 `console`。
- 组件：PascalCase（如 `ChatHistory.tsx`、`SystemRoleSettings.tsx`）。
- 页面：小写 `.astro`（如 `index.astro`）。
- 导入：使用别名 `@/*`（示例：`import { CONFIG } from '@/config/constants'`）。

## 测试指南
- 当前未配置测试框架。建议逐步引入 Vitest（单元）与 Playwright（冒烟）。至少手动验证：
  - `src/pages/api/generate.ts` 的流式响应；
  - 模型切换与历史记录持久化；
  - 访问密码与签名校验逻辑。
  - 运行最小化单测：`pnpm test`（示例见 `tests/openAI.test.ts`）。

## 提交与 Pull Request 指南
- 提交：使用祈使句，小步聚焦；推荐前缀 `feat:`、`fix:`、`refactor:`、`docs:`。
- PR：说明变更与动机、关联 issues、UI 改动附截图/GIF、自测清单；确保 `pnpm lint` 通过且可构建。

## 安全与配置
- 环境：复制 `.env.example` → `.env`；设置 `OPENAI_API_KEY`、`PUBLIC_SECRET_KEY`，可选 `SITE_PASSWORD`、`OPENAI_API_BASE_URL`、`HTTPS_PROXY`。
- 切勿提交密钥；签名校验见 `src/utils/auth.ts`；模型允许列表见 `src/config/constants.ts` 并保持更新。

## 架构概览
```
[UI 层] Astro + Solid
  ├─ 组件：src/components
  ├─ 页面：src/pages/*.astro
  └─ API：src/pages/api
        ├─ generate.ts → 调 OpenAI(undici/ProxyAgent) 流式输出
        └─ auth.ts → 校验访问密码/签名

[配置] src/config/constants.ts  |  [工具] src/utils/openAI.ts、src/utils/auth.ts
```

参见 README 获取快速开始与部署说明。
