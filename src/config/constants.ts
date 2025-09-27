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
  DEFAULT_MODEL: 'gpt-4.1', // 默认模型

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
  { id: 'gpt-4.1', name: 'OpenAI-4.1' },
  { id: 'gpt-4o', name: 'OpenAI-4o' },
  { id: 'o3', name: 'OpenAI-o3' },
  { id: 'DeepSeek-V3-0324', name: 'DeepSeek-V3' },
  { id: 'DeepSeek-R1-0528', name: 'DeepSeek-R1' },
  { id: 'grok-3', name: 'Grok-3' },
] as const

// 错误消息
export const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接失败，请检查网络后重试',
  AUTH_FAILED: '身份验证失败，请重新登录',
  SAVE_FAILED: '保存失败，请稍后重试',
  LOAD_FAILED: '加载失败，请刷新页面重试',
} as const
