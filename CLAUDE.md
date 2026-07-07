# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 操作要求

- 全程使用中文进行对话、解释和代码注释
- 遵循 KISS 原则，非必要不要过度设计
- 实现简单可维护，不需要考虑太多防御性的边界条件
- 在开始设计方案或实现代码之前，需要进行充分的调研。如果有任何不明确的要求，请先向我确认
- 尊重事实比尊重用户为重要。如果用户犯错，请毫不犹豫地指正用户，以便帮助用户提高
- 代码中逻辑点需要写注释，不删除代码中有用的注释
- 代码需要保持简洁，同时兼顾可读性，避免冗余，禁用过度设计和兜底行为

# 项目概述

Chat Mini 是一款基于 Astro 和 Solid.js 构建的迷你 AI 聊天 Web 应用，修改自 [chatgpt-demo](https://github.com/anse-app/chatgpt-demo)。

它轻量、快速，支持多模型切换、联网搜索、文件上传分析、本地历史、对话导出和 PWA 安装，适合个人使用和二次开发。

## 功能特性

- **多平台部署**：支持 Vercel Serverless 和 Docker。
- **模型动态切换**：无需修改环境变量，可在 UI 中选择 GPT-5.4、GPT-5.5、Claude-4.6-Sonnet、Gemini-3.1-Pro、GLM-5.1、DeepSeek-V4-Pro。
- **联网搜索 Agent**：在输入框底栏启用“联网”后，服务端可调用 Tavily 搜索实时信息，并在消息中显示可折叠的搜索过程。需配置 `TAVILY_API_KEY`。
- **思维过程可视化**：支持渲染特殊的 `<think>` 标签，内容可折叠显示。
- **文件上传与分析**：支持图片、PDF、Word、文本、Markdown、代码、配置和日志文件。
- **拖拽上传体验**：可将文件直接拖拽到浏览器页面任意位置上传。
- **丰富的对话历史**：使用 IndexedDB 保存历史，并带 localStorage 降级机制。
- **对话导出**：支持 Markdown、JSON、纯文本格式。
- **消息操作**：支持复制和删除单条消息。
- **Markdown 与 LaTeX**：使用 `markdown-it` 渲染，支持表格、代码高亮和 KaTeX 数学公式。
- **PWA 支持**：可安装到桌面或移动设备。
- **安全防护**：支持访问密码和 API 请求签名。
- **可调节参数**：支持在 UI 中实时调整 `temperature`。

## 技术栈

- **核心框架**：[Astro](https://astro.build/) v5.18.2
- **UI 框架**：[Solid.js](https://www.solidjs.com/) v1.9.14
- **CSS 方案**：[UnoCSS](https://unocss.dev/) v66.7.4
- **UI 组件**：[@zag-js/slider](https://zagjs.com/) v1.42.0
- **Markdown 渲染**：[markdown-it](https://github.com/markdown-it/markdown-it) v14.2.0
- **代码高亮**：[highlight.js](https://highlightjs.org/) v11.8.0
- **数学公式**：[KaTeX](https://katex.org/) v0.16.47
- **工具库**：[solidjs-use](https://github.com/solidjs-use/solidjs-use) v2.1.0
- **文件处理**：原生 File API + Base64 编码
- **存储方案**：IndexedDB，带 localStorage 降级
- **流解析**：[eventsource-parser](https://github.com/rexxars/eventsource-parser) v1.0.0
- **加密签名**：[js-sha256](https://github.com/emn178/js-sha256) v0.9.0
- **包管理器**：[pnpm](https://pnpm.io/) v11.7.0
- **PWA 支持**：[@vite-pwa/astro](https://vite-pwa-org.netlify.app/frameworks/astro.html) v1.2.0

## 快速开始

1. **安装依赖**

   ```bash
   pnpm install
   ```

2. **配置环境变量**

   ```bash
   cp .env.example .env
   ```

   至少填入 `OPENAI_API_KEY`。如需联网搜索，再填入 `TAVILY_API_KEY`。

3. **启动开发服务器**

   ```bash
   pnpm dev
   ```

   在浏览器中打开 `http://localhost:4321`。

## 文件上传

- **支持类型**：JPEG、PNG、GIF、WebP、PDF、Word、Plain Text、Markdown、JavaScript、HTML、CSS、PHP、Go、Python、Java、C/C++、C#、JSON、XML、YAML、Log。
- **上传方式**：点击附件按钮选择文件，或将文件拖拽到浏览器页面任意位置。
- **文件限制**：常规文本类文件最大 `50MB`，图片最大 `10MB`，需 Base64 编码的非图片二进制文件最大 `5MB`。

## 对话导出

- **Markdown**：包含完整格式、思考过程、附件信息和导出时间。
- **JSON**：包含结构化对话数据和附件元数据，不包含 Base64 内容。
- **纯文本**：适合快速阅读和归档。
- 导出文件名格式为 `chat-export-YYYY-MM-DD-HH-mm-ss.ext`。

## 配置

### 环境变量

| 变量名 | 说明 |
| :--- | :--- |
| `OPENAI_API_KEY` | 必需，OpenAI 兼容接口 API key。 |
| `SITE_PASSWORD` | 网站访问密码，多个密码用英文逗号分隔。留空则公开访问。 |
| `PUBLIC_SECRET_KEY` | 用于 API 调用签名的密钥。 |
| `HTTPS_PROXY` | OpenAI 和 Tavily 请求代理，例如 `http://127.0.0.1:7890`。 |
| `OPENAI_API_BASE_URL` | OpenAI 兼容接口基础 URL，用于代理或私有化部署。 |
| `HEAD_SCRIPTS` | 注入到页面 `</head>` 前的脚本。 |
| `TAVILY_API_KEY` | Tavily 搜索 API key。配置后才能使用“联网”开关。 |

### 应用内常量

常量位于 `src/config/constants.ts`。

| 常量名 | 当前值 |
| :--- | :--- |
| `CONTEXT_WINDOW_SIZE` | `9` |
| `HISTORY_LIST_LIMIT` | `25` |
| `DEFAULT_TEMPERATURE` | `0.6` |
| `DEFAULT_MODEL` | `'gpt-5.5'` |
| `MAX_FILE_SIZE` | `50MB` |
| `MAX_IMAGE_SIZE` | `10MB` |
| `MAX_BINARY_FILE_SIZE` | `5MB` |
| `AUTH_TIMEOUT` | `5分钟` |
| `SAVE_DEBOUNCE_TIME` | `500ms` |
| `AVAILABLE_MODELS` | `GPT-5.4、GPT-5.5、Claude-4.6-Sonnet、Gemini-3.1-Pro、GLM-5.1、DeepSeek-V4-Pro` |
| `AGENT.MAX_TOOL_ROUNDS` | `3` |
| `AGENT.TAVILY_MAX_RESULTS` | `5` |
| `AGENT.TAVILY_SEARCH_DEPTH` | `'basic'` |

## 部署

### Vercel

项目已配置为 Vercel Serverless 部署。导入仓库后，Vercel 会识别 `vercel.json` 和 `package.json` 中的 `build:vercel` 构建命令。

### Docker

```bash
docker-compose up -d --build
docker-compose down
```

服务默认运行在 `http://localhost:3000`。

## 可用脚本

- `pnpm dev`：启动开发服务器。
- `pnpm build`：为 Node.js standalone 环境构建生产版本。
- `pnpm build:vercel`：为 Vercel Serverless 构建。
- `pnpm preview`：本地预览构建产物。
- `pnpm lint`：检查代码风格。
- `pnpm lint:fix`：自动修复代码风格问题。

## 文档

- `README.md`：面向使用者和部署者的项目说明。
- `docs/security-remediation-plan.md`：安全修复归档。
- `docs/astro-upgrade-evaluation.md`：Astro 5 升级评估与落地记录。
- `docs/web-search-agent-plan.md`：联网搜索 Agent 实现记录。
- `docs/manual-test-slider.md`：Zag slider 手动测试指南。

## 许可证

本项目基于 [MIT License](LICENSE) 授权。
