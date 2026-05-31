import type { ChatMessage } from '@/types'

const MESSAGE_KEY = 'messageList'
const SYSTEM_ROLE_KEY = 'systemRoleSettings'

export interface ChatSessionData {
  messageList?: ChatMessage[]
  systemRole?: string
}

// 当前会话由 ChatRoot 的 pagehide 钩子同步写入 sessionStorage（见 ChatRoot.handleBeforeUnload），
// 这里只负责读回来。历史对话走 historyStore -> IndexedDB，不在此处理。
export const loadChatSession = async(): Promise<ChatSessionData> => {
  if (typeof sessionStorage === 'undefined')
    return {}

  let messageList: ChatMessage[] | undefined
  try {
    const raw = sessionStorage.getItem(MESSAGE_KEY)
    if (raw) messageList = JSON.parse(raw)
  } catch (error) {
    console.error('Failed to read messageList from sessionStorage:', error)
  }

  let systemRole: string | undefined
  try {
    systemRole = sessionStorage.getItem(SYSTEM_ROLE_KEY) ?? undefined
  } catch (error) {
    console.error('Failed to read system role from sessionStorage:', error)
  }

  return { messageList, systemRole }
}
