// 应用配置常量
export const CONFIG = {
  // 对话相关
  CONTEXT_WINDOW_SIZE: 9, // 传给openai api的消息最大上下文条数
  HISTORY_LIST_LIMIT: 25, // 保留最近的多少次历史会话

  // 时间相关
  AUTH_TIMEOUT: 1000 * 60 * 5, // 5分钟
  SAVE_DEBOUNCE_TIME: 500, // 保存防抖时间

  // UI相关
  SCROLL_THRESHOLD: 25, // 滚动阈值
  SMOOTH_SCROLL_DELAY: 300, // 平滑滚动延迟
  LOAD_SCROLL_DELAY: 100, // 加载历史会话后等 DOM 渲染再滚动的延迟

  // 存储相关
  HISTORY_CLEANUP_PROBABILITY: 0.1, // 每次保存触发一次清理的概率

  // 模型和温度默认值
  DEFAULT_TEMPERATURE: 0.6, // 默认温度
  DEFAULT_MODEL: 'gpt-5.6-sol', // 默认模型
  DEFAULT_SYSTEM_ROLE: '你是一个有用的助手。默认回复中文，回答短一点。直接、冷静、少废话、高效、专业。', // 系统角色预设初始值

  // 文件上传限制（PDF/Word 在客户端解析为纯文本，与文本文件共用同一限制）
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB（文本与文档类）
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // 开发文件类型
    'text/javascript',
    'application/javascript',
    'text/html',
    'text/css',
    // PHP 文件类型
    'text/php',
    'text/x-php',
    'application/x-httpd-php',
    'application/php',
    // Go 文件类型
    'text/x-go',
    'application/x-go',
    // 日志文件类型
    'text/x-log',
    'application/x-log',
    // Python 文件类型
    'text/x-python',
    'application/x-python',
    // Java 文件类型
    'text/x-java',
    'application/x-java',
    // C/C++ 文件类型
    'text/x-c',
    'text/x-c++',
    'text/x-csharp',
    // 配置文件类型
    'application/json',
    'application/xml',
    'text/xml',
    // YAML 文件类型
    'application/yaml',
    'application/x-yaml',
    'text/yaml',
    'text/x-yaml',
  ],
} as const

// 可选的模型列表
export const AVAILABLE_MODELS = [
  { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6-Terra' },
  { id: 'claude-sonnet-5', name: 'Claude-Sonnet-5' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
  { id: 'glm-5.2', name: 'GLM-5.2' },
  { id: 'hy3', name: 'Hunyuan-3' },
] as const

// 错误消息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  AUTH_FAILED: '身份验证失败，请重新登录',
  SAVE_FAILED: '保存失败，请稍后重试',
  LOAD_FAILED: '加载失败，请刷新页面重试',
} as const

// Agent / 工具调用相关
export const AGENT = {
  TAVILY_MAX_RESULTS: 5,
  TAVILY_SEARCH_DEPTH: 'basic' as 'basic' | 'advanced',
  SEARXNG_MAX_RESULTS: 5, // SearXNG 降级搜索的结果条数
} as const
