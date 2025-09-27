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
