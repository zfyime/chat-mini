# Chat Mini UI 改造方案 — 对标 ATXP Chat

## 一、改造目标

将 Chat Mini 的 UI 从当前的**单列居中布局**改造为 ATXP Chat 风格的**侧边栏 + 主聊天区双栏布局**，提升视觉体验和交互一致性。

仅改造 UI 层面（布局、样式、组件结构），不涉及后端 API、数据存储、流式解析等逻辑变动。

---

## 二、当前 vs 目标 对比

| 维度 | 当前 Chat Mini | 目标 ATXP 风格 |
|------|---------------|---------------|
| 整体布局 | 单列居中，max-width 85ch | 左侧边栏(260px) + 右侧聊天区，全屏 flex |
| 侧边栏 | 无常驻侧边栏，历史记录是底部弹出面板 | 常驻左侧栏，含品牌、新建对话按钮、历史列表、用户区 |
| 顶栏 | 独立 Header 组件（Logo + 主题切换） | 聊天区内浮动半透明顶栏（模型选择 + 功能按钮） |
| 消息气泡 | 无头像，无左右区分，统一靠左 | 用户消息靠右+头像，AI消息靠左+头像 |
| 输入框 | 普通矩形输入框 + 横排按钮 | 胶囊型圆角输入框(rounded-3xl)，底部工具栏 |
| 主题 | CSS变量(--c-bg/--c-fg) + .dark class | 语义化token(--surface-primary, --text-primary等) |
| 配色 | 浅色 #fbfbfb，深色 #212129 | 浅色 #ffffff，深色 #0d0d0d |

---

## 三、改造内容分阶段

### 第一阶段：布局重构（核心）

**涉及文件：** Layout.astro, index.astro, Generator.tsx, ChatHistory.tsx

#### 1.1 全局布局改为双栏

```
┌──────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────┐ │
│ │          │ │  浮动顶栏（模型选择/按钮）    │ │
│ │  侧边栏   │ ├─────────────────────────────┤ │
│ │  260px   │ │                             │ │
│ │          │ │       消息区域               │ │
│ │ - 品牌   │ │                             │ │
│ │ - 新建   │ │                             │ │
│ │ - 历史   │ │                             │ │
│ │ - 设置   │ ├─────────────────────────────┤ │
│ │          │ │     胶囊型输入框             │ │
│ └──────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**具体改动：**

- **Layout.astro**：移除 `main` 的 `max-w-85ch` 限制，改为 `flex h-screen w-full`
- **index.astro**：页面结构改为 `<div class="flex h-full"><Sidebar /><MainChat /></div>`
- **Generator.tsx**：从顶层容器中拆出侧边栏，主体占满剩余空间

#### 1.2 侧边栏组件（新建 Sidebar.tsx）

将 ChatHistory.tsx 从弹出面板改为常驻侧边栏：

```
Sidebar
├── 品牌区：Logo + "Chat Mini" 标题 + 侧边栏折叠按钮
├── 新建对话按钮（全宽，醒目样式）
├── 对话历史列表（flex-1 可滚动）
│   └── 每项：标题 + 时间 + hover显示删除
└── 底部：主题切换 + 设置入口
```

- 宽度：260px，可折叠（移动端默认收起）
- 移动端：汉堡菜单触发，overlay 方式展开
- 当前对话高亮

#### 1.3 移动端适配

- `< md` 断点：侧边栏隐藏，顶部显示汉堡菜单按钮
- 点击汉堡菜单：侧边栏以 overlay 滑出
- 点击遮罩或选择对话后自动关闭

---

### 第二阶段：消息区域重新设计

**涉及文件：** MessageItem.tsx, message.css

#### 2.1 消息方向与头像

- **用户消息**：`flex-row-reverse`，消息靠右对齐，右侧显示用户头像
- **AI 消息**：`flex-row`，消息靠左对齐，左侧显示 AI 头像（模型图标）
- 头像：24-28px 圆形，用户显示首字母或默认图标，AI 显示模型 logo

#### 2.2 消息容器

- 最大宽度限制：`md:max-w-[47rem] xl:max-w-[55rem]`，水平居中
- 消息操作按钮（复制/删除/重试）：hover 时显示，改为图标按钮排列在消息底部
- 用户名显示在消息上方（用户侧右对齐，AI 侧左对齐）

#### 2.3 思考过程样式

保持现有 `<details>` 折叠方式，但视觉上更贴合 ATXP 风格：
- 浅灰背景卡片
- 左侧竖线装饰

---

### 第三阶段：输入框重新设计

**涉及文件：** Generator.tsx, FileUpload.tsx

#### 3.1 胶囊型输入框

```
┌────────────────────────────────────────┐
│  [输入文字...]                          │
├────────────────────────────────────────┤
│ 📎  ⚙️          ○ 发送                 │
└────────────────────────────────────────┘
```

- 外框：`rounded-3xl border shadow-md`
- textarea 在上半部分，无边框，透明背景
- 底部工具栏：附件按钮（左）、发送按钮（右，圆形实心）
- placeholder：`"发送消息给 {模型名}"`

#### 3.2 文件预览

- 预览区在输入框内部上方（输入框内嵌）
- 保持现有缩略图 + 文件名 + 删除按钮的模式

---

### 第四阶段：顶栏与细节

**涉及文件：** Header.astro（可能废弃或重构）, Generator.tsx

#### 4.1 浮动顶栏

- 位置：聊天区顶部，`absolute/sticky`
- 背景：半透明渐变 `bg-gradient-to-b from-white/80 to-transparent`
- 左侧：模型选择下拉按钮（显示当前模型名 + 图标）
- 右侧：导出按钮、设置按钮

#### 4.2 系统角色设置

- 从当前独立面板改为：点击顶栏设置按钮弹出侧面板或弹窗
- 包含：系统提示词、温度滑块、模型选择

#### 4.3 CSS 变量体系升级

引入语义化 token，兼容现有 UnoCSS：

```css
:root {
  --surface-primary: #ffffff;
  --surface-primary-alt: #f9f9f9;    /* 侧边栏背景 */
  --surface-chat: #ffffff;            /* 输入框背景 */
  --surface-hover: #f5f5f5;
  --text-primary: #0d0d0d;
  --text-secondary: #6b6b6b;
  --text-tertiary: #999999;
  --border-light: #e5e5e5;
  --presentation: #ffffff;            /* 聊天区背景 */
}

html.dark {
  --surface-primary: #0d0d0d;
  --surface-primary-alt: #171717;
  --surface-chat: #1a1a1a;
  --surface-hover: #2a2a2a;
  --text-primary: #ececec;
  --text-secondary: #9b9b9b;
  --text-tertiary: #666666;
  --border-light: #2e2e2e;
  --presentation: #212121;
}
```

---

## 四、不改动的部分

以下功能保持现有实现不变：

- 流式消息解析与 `<think>` 标签处理
- Markdown / KaTeX / 代码高亮渲染逻辑
- 文件上传处理逻辑（类型检测、Base64 编码、大小限制）
- IndexedDB 存储与降级机制
- API 调用、签名验证、密码认证
- 对话导出功能（仅调整触发按钮位置）
- PWA 相关配置

---

## 五、文件变动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/layouts/Layout.astro` | 修改 | 移除居中限制，改全屏flex，新增CSS变量 |
| `src/pages/index.astro` | 修改 | 引入Sidebar，调整页面结构 |
| `src/components/Sidebar.tsx` | **新建** | 常驻侧边栏组件 |
| `src/components/Generator.tsx` | 修改 | 重构输入框和顶栏UI，移除旧历史/导出按钮 |
| `src/components/MessageItem.tsx` | 修改 | 增加头像、左右对齐、操作按钮样式 |
| `src/components/ChatHistory.tsx` | **删除或合并** | 逻辑合并到 Sidebar.tsx |
| `src/components/Header.astro` | **删除或重构** | 功能合并到浮动顶栏 |
| `src/components/SystemRoleSettings.tsx` | 修改 | 改为弹窗/侧面板触发方式 |
| `src/styles/message.css` | 修改 | 适配新消息布局、新token变量 |
| `src/styles/sidebar.css` | **新建** | 侧边栏样式 |

---

## 六、实施建议

1. **按阶段提交**：每个阶段完成后独立提交，便于 review 和回滚
2. **优先保证移动端可用**：每阶段都要验证移动端表现
3. **渐进替换 CSS 变量**：先新增语义化 token，再逐步替换旧变量引用，避免一次性大改导致样式崩溃
