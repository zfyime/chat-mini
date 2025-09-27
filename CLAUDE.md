# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 操作要求

- 回复用户需要使用中文
- 非必要不要过度设计
- 实现简单可维护，不需要考虑太多防御性的边界条件
- 尊重事实比尊重我更为重要。如果我犯错，请毫不犹豫地指正我，以便帮助我提高

# 项目概述

Chat Mini 是一款基于 Astro 和 Solid.js 构建的迷你 AI 聊天 Web 应用，修改自 [chatgpt-demo](https://github.com/anse-app/chatgpt-demo)。

它轻量、快速、功能丰富，支持多种文件类型上传与 AI 分析，并为多种部署环境提供了支持，非常适合个人使用和二次开发。

## ✨ 功能特性

- **多平台部署**: 支持通过 Docker、Vercel 和 Netlify 进行一键部署。
- **模型动态切换**: 无需修改环境变量，直接在 UI 上选择并切换对话模型，支持 GPT-4.1、GPT-5、Claude-4-Sonnet、Gemini-2.5-Pro、Grok-4、DeepSeek-V3.1、豆包-Seed-1.6、GLM-4.5、Kimi-K2 等主流模型。
- **思维过程可视化**: 支持渲染特殊的 `<think>` 标签，直观展示模型的思考步骤，内容可折叠显示。
- **文件上传与分析**: 支持上传图片、PDF、文档、代码文件等多种类型，AI 可对文件内容进行分析和回答。
- **拖拽上传体验**: 支持全局拖拽上传，可将文件直接拖拽到浏览器任意位置进行上传。
- **丰富的对话历史**: 自动在本地保存对话历史，方便随时回顾和恢复会话。
- **对话导出**: 支持将对话导出为 Markdown、JSON、纯文本格式，方便分享和存档。
- **IndexedDB 存储**: 使用 IndexedDB 替代 localStorage，支持更大的存储容量，带有 localStorage 降级机制。
- **消息操作**: 支持复制单条消息和删除单条消息，方便管理对话内容。
- **Markdown 与 LaTeX**: 使用 `markdown-it` 进行渲染，支持表格、代码高亮 (`highlight.js`) 和数学公式 (`KaTeX`)。
- **PWA 支持**: 可作为渐进式网络应用安装到桌面或移动设备，提供接近原生的体验。
- **安全防护**: 支持设置访问密码，并使用签名机制保护 API 调用。
- **可调节的对话参数**: 支持在 UI 上实时调整 `temperature` 参数。
- **文件大小限制**: 支持最大 50MB 的常规文件和最大 10MB 的图片文件。

## 🛠️ 技术栈

- **核心框架**: [Astro](https://astro.build/) v2.7.0
- **UI 框架**: [Solid.js](https://www.solidjs.com/) v1.7.6
- **CSS 方案**: [UnoCSS](https://unocss.dev/) v0.50.8
- **UI 组件**: [@zag-js/slider](https://zagjs.com/) v0.16.0 (滑块组件)
- **Markdown 渲染**: [markdown-it](https://github.com/markdown-it/markdown-it) v13.0.1
- **代码高亮**: [highlight.js](https://highlightjs.org/) v11.8.0
- **数学公式**: [KaTeX](https://katex.org/) v0.16.7
- **工具库**: [solidjs-use](https://github.com/solidjs-use/solidjs-use) v2.1.0
- **文件处理**: 原生 File API + Base64 编码
- **存储方案**: IndexedDB (带 localStorage 降级)
- **流解析**: [eventsource-parser](https://github.com/rexxars/eventsource-parser) v1.0.0
- **加密签名**: [js-sha256](https://github.com/emn178/js-sha256) v0.9.0
- **包管理器**: [pnpm](https://pnpm.io/) v7.28.0
- **PWA 支持**: [@vite-pwa/astro](https://vite-pwa-org.netlify.app/frameworks/astro.html) v0.1.1

## 🚀 快速开始

1.  **克隆仓库**
    ```bash
    git clone https://github.com/your-username/chat-mini.git
    cd chat-mini
    ```

2.  **安装依赖**
    ```bash
    pnpm install
    ```

3.  **配置环境变量**
    复制 `.env.example` 文件为 `.env`，并至少填入你的 `OPENAI_API_KEY`。
    ```bash
    cp .env.example .env
    ```

4.  **启动开发服务器**
    ```bash
    pnpm dev
    ```
    在浏览器中打开 `http://localhost:4321` 即可开始使用。

## 📎 文件上传功能

### 支持的文件类型

- **图片文件**: JPEG、PNG、GIF、WebP 格式
- **文档文件**: PDF 文档、Word 文档
- **文本文件**: Plain Text (.txt)、Markdown (.md) 文件
- **代码文件**: JavaScript (.js)、HTML (.html)、CSS (.css)、PHP (.php)、Go (.go)、Python (.py)、Java (.java)、C/C++ (.c/.cpp)、C# (.cs)、JSON (.json)、XML (.xml)、YAML (.yaml/.yml)
- **日志文件**: Log 文件 (.log)

### 上传方式

1. **点击上传**: 点击输入框左侧的附件按钮 📎 选择文件
2. **拖拽上传**: 直接将文件拖拽到浏览器页面任意位置

### 文件预览与管理

- **实时预览**: 上传后的文件会在输入框上方显示预览
- **文件信息**: 显示文件名、大小和类型图标
- **单独删除**: 点击文件项右侧的 × 按钮删除单个文件
- **批量清除**: 点击"清除全部"按钮删除所有已选文件

### AI 分析能力

- **图片分析**: 支持图片内容识别、OCR 文字提取、图表解读等
- **文档解析**: 可以阅读和分析 PDF、Word 文档内容
- **文本处理**: 对 Markdown 和文本文件进行内容分析和问答
- **代码分析**: 支持多种编程语言的代码审查、问题诊断、优化建议和功能解释
- **配置文件**: 可以解析和分析 JSON、XML、YAML 等配置文件
- **日志分析**: 支持日志文件的错误排查和问题定位

### 使用提示

- 每次对话可以同时上传多个文件
- 文件内容会与文字消息一起发送给 AI
- 图片文件会以 Base64 格式编码传输
- 文本文件、代码文件、配置文件会直接读取内容进行分析
- 支持多种编程语言的语法高亮和代码分析

## 💾 对话导出功能

### 支持的格式

- **Markdown (.md)**: 包含完整格式的对话记录，支持思考过程折叠显示，带有导出时间戳
- **JSON (.json)**: 结构化的对话数据，适合程序处理和分析，包含附件元数据但不包含Base64内容以减小文件大小
- **纯文本 (.txt)**: 简洁的纯文本格式，适合快速阅读，包含思考过程和附件信息

### 导出内容

- 完整的对话历史
- 系统角色设定
- 思考过程（如果有）
- 附件信息列表（文件名、大小、类型）
- 导出时间戳（本地时间和ISO格式）
- 消息统计信息

### 使用方式

1. 在对话界面进行对话
2. 点击左下角的导出按钮（下载图标）
3. 选择导出格式
4. 文件将自动下载到本地，文件名格式为 `chat-export-YYYY-MM-DD-HH-mm-ss.ext`

### 文件处理机制

- 智能文件名生成：基于导出时间自动生成唯一文件名
- 安全下载：支持现代浏览器的下载API，带有降级处理
- 内容优化：JSON格式会移除Base64内容以减小文件大小，但保留附件元信息

## ⚙️ 配置

项目的配置分为两部分：**环境变量**和**应用内常量**。

### 环境变量 (`.env`)

这些是部署时需要设置的密钥和环境特定配置。

| 变量名 | 说明 |
| :--- | :--- |
| `OPENAI_API_KEY` | **必需**，你的 OpenAI API 密钥。 |
| `SITE_PASSWORD` | 网站访问密码，多个密码用英文逗号 `,` 分隔。留空则公开访问。 |
| `PUBLIC_SECRET_KEY` | 用于 API 调用的签名密钥，请设置为一个复杂的随机字符串。 |
| `HTTPS_PROXY` | OpenAI API 的代理地址，例如 `http://127.0.0.1:7890`。 |
| `OPENAI_API_BASE_URL` | OpenAI API 的基础 URL，用于代理或私有化部署。 |
| `HEAD_SCRIPTS` | 在页面 `</head>` 标签前注入的分析或其他脚本。 |

### 应用内常量 (`src/config/constants.ts`)

这些是写在代码中的配置，用于控制应用的核心行为。如果需要修改，请直接编辑此文件。

| 常量名 | 说明 | 当前值 |
| :--- | :--- | :--- |
| `MAX_HISTORY_MESSAGES` | 发送给 API 的最大上下文消息数量。 | `9` |
| `MAX_HISTORY_COUNT` | 在本地浏览器中保留的最近历史会话数量。 | `25` |
| `DEFAULT_TEMPERATURE` | 默认的 `temperature` 参数值。 | `0.6` |
| `DEFAULT_MODEL` | 默认模型 ID（由应用配置决定）。 | `'gpt-5-chat'` |
| `MAX_FILE_SIZE` | 常规文件的最大上传大小限制。 | `50MB` |
| `MAX_IMAGE_SIZE` | 图片文件的最大上传大小限制。 | `10MB` |
| `AUTH_TIMEOUT` | 身份验证超时时间。 | `5分钟` |
| `SAVE_DEBOUNCE_TIME` | 保存操作的防抖时间。 | `500ms` |
| `AVAILABLE_MODELS` | 在 UI 界面上可供选择的模型列表。 | `GPT-4.1、GPT-5、Claude-4-Sonnet、Gemini-2.5-Pro、Grok-4、DeepSeek-V3.1、豆包-Seed-1.6、GLM-4.5、Kimi-K2` |

## 🚢 部署

你可以通过以下三种方式部署此应用：

### 1. Vercel

项目已配置为可直接部署到 Vercel Edge。只需将你的仓库导入 Vercel，它将自动识别 `vercel.json` 和 `package.json` 中的构建命令 `build:vercel` 并完成部署。

### 2. Netlify

项目同样支持一键部署到 Netlify Edge Functions。将仓库导入 Netlify，它会使用 `netlify.toml` 中的配置和 `build:netlify` 命令进行构建和部署。

### 3. Docker

你可以使用项目根目录下的 `Dockerfile` 和 `docker-compose.yml` 来构建和运行 Docker 容器。

```bash
# 构建并以后台模式启动服务
docker-compose up -d --build

# 停止并移除容器
docker-compose down
```
服务将在 `http://localhost:3000` 上运行。

## 📜 可用脚本

- `pnpm dev`: 启动开发服务器。
- `pnpm build`: 为 Node.js 环境构建生产版本。
- `pnpm build:vercel`: 为 Vercel 平台构建。
- `pnpm build:netlify`: 为 Netlify 平台构建。
- `pnpm preview`: 在本地预览构建后的产物。
- `pnpm lint`: 检查代码风格。
- `pnpm lint:fix`: 自动修复代码风格问题。

## 📄 许可证

该项目基于 [MIT License](LICENSE) 授权。
