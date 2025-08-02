export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  think?: string
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
