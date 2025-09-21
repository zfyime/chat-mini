# Chat Mini

一款基于 Astro 和 Solid.js 构建的迷你 AI 聊天 Web 应用，修改自 [chatgpt-demo](https://github.com/anse-app/chatgpt-demo)。

它轻量、快速、功能丰富，并为多种部署环境提供了支持，非常适合个人使用和二次开发。

## ✨ 功能特性

- **多平台部署**: 支持通过 Docker、Vercel 和 Netlify 进行一键部署。
- **模型动态切换**: 无需修改环境变量，直接在 UI 上选择并切换对话模型。
- **思维过程可视化**: 支持渲染特殊的 `<think>` 标签，直观展示模型的思考步骤。
- **丰富的对话历史**: 自动在本地保存对话历史，方便随时回顾和恢复会话。
- **消息操作**: 支持复制单条消息和删除单条消息，方便管理对话内容。
- **Markdown 与 LaTeX**: 使用 `markdown-it` 进行渲染，支持表格、代码高亮 (`highlight.js`) 和数学公式 (`KaTeX`)。
- **PWA 支持**: 可作为渐进式网络应用安装到桌面或移动设备，提供接近原生的体验。
- **安全防护**: 支持设置访问密码，并使用签名机制保护 API 调用。
- **可调节的对话参数**: 支持在 UI 上实时调整 `temperature` 参数。

## 🛠️ 技术栈

- **核心框架**: [Astro](https://astro.build/)
- **UI 框架**: [Solid.js](https://www.solidjs.com/)
- **CSS 方案**: [UnoCSS](https://unocss.dev/)
- **包管理器**: [pnpm](https://pnpm.io/)

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

## ⚙️ 配置

项目的配置分为两部分：**环境变量**和**应用内常量**。

### 环境变量 (`.env`)

这些是部署时需要设置的密钥和环境特定配置。

| 变量名 | 说明 |
| :--- | :--- |
| `OPENAI_API_KEY` | **必需**，你的 OpenAI API 密钥。 |
| `OPENAI_API_MODEL` | 默认使用的模型 ID。 |
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
| `DEFAULT_MODEL` | 默认模型 ID（若环境变量未设置）。 | `'gpt-4.1'` |
| `AVAILABLE_MODELS` | 在 UI 界面上可供选择的模型列表（详见 `src/config/constants.ts`）。 | [...见源码] |

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

## 🤝 开发与贡献

请阅读仓库的贡献指引与编码规范：参见 AGENTS.md（仓库根目录）。

如需运行最小化测试：

```bash
pnpm test
```

## 📄 许可证

该项目基于 [MIT License](LICENSE) 授权。
