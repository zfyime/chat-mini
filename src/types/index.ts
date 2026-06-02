export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  content: string // 原始文本或 Base64 字符串，视 encoding 而定
  url?: string // Optional preview URL
  encoding?: 'base64' | 'text'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  think?: string
  toolTrace?: string // 联网搜索等工具调用的过程信息（仅展示用）
  // agent 循环产生的中间协议消息（assistant 的 tool_calls + role:'tool' 结果），
  // OpenAI 原始格式，仅用于后续轮次回灌上下文复用搜索结果，不展示、不导出。
  toolContext?: any[]
  attachments?: FileAttachment[]
}

export interface ErrorMessage {
  code: string
  message: string
}

export interface ChatHistory {
  id: string
  title: string
  messages: ChatMessage[]
  systemRole: string
  createdAt: number
  updatedAt: number
}
