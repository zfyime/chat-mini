export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  content: string // Base64 content for images or text content for documents
  url?: string // Optional preview URL
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
