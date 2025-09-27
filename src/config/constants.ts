// 应用配置常量
export const CONFIG = {
  // 对话相关
  MAX_HISTORY_MESSAGES: 9, // 传给openai api的消息最大上下文条数
  MAX_HISTORY_COUNT: 25, // 保留最近的多少次历史会话

  // 时间相关
  AUTH_TIMEOUT: 1000 * 60 * 5, // 5分钟
  SAVE_DEBOUNCE_TIME: 500, // 保存防抖时间

  // UI相关
  SCROLL_THRESHOLD: 25, // 滚动阈值
  SMOOTH_SCROLL_DELAY: 300, // 平滑滚动延迟

  // 模型和温度默认值
  DEFAULT_TEMPERATURE: 0.6, // 默认温度
  DEFAULT_MODEL: 'gpt-5-chat', // 默认模型

  // 文件上传限制
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
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
  { id: 'gpt-4.1', name: 'gpt-4.1' },
  { id: 'gpt-5-chat', name: 'gpt-5' },
  { id: 'cc-sonnet-4-20250514', name: 'claude-4-sonnet' },
  { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' },
  { id: 'grok-4', name: 'grok-4' },
  { id: 'deepseek-v3.1-250821', name: 'deepseek-v3.1' },
  { id: 'doubao-seed-1-6-250615', name: 'doubao-seed-1.6' },
  { id: 'glm-4.5', name: 'glm-4.5' },
  { id: 'kimi-k2-0905-preview', name: 'kimi-k2' },
] as const

// 错误消息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  AUTH_FAILED: '身份验证失败，请重新登录',
  SAVE_FAILED: '保存失败，请稍后重试',
  LOAD_FAILED: '加载失败，请刷新页面重试',
} as const
