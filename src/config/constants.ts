// 应用配置常量
export const CONFIG = {
  // 对话相关
  MAX_HISTORY_MESSAGES: 6,
  MAX_HISTORY_COUNT: 50,
  
  // 时间相关
  AUTH_TIMEOUT: 1000 * 60 * 5, // 5分钟
  SAVE_DEBOUNCE_TIME: 500, // 保存防抖时间
  
  // UI相关
  SCROLL_THRESHOLD: 25, // 滚动阈值
  SMOOTH_SCROLL_DELAY: 300,
  
  // 默认值
  DEFAULT_TEMPERATURE: 0.6,
  DEFAULT_MODEL: 'gpt-4.1',
} as const

export const AVAILABLE_MODELS = [
  { id: 'gpt-4.1', name: 'OpenAI-4.1' },
  { id: 'gpt-4o', name: 'OpenAI-4o' },
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