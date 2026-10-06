import { getHistoryById, historyLoaded } from '@/store/historyStore'
import type { ChatMessage } from '@/types'

const SYSTEM_ROLE_KEY = 'systemRoleSettings'
const HISTORY_ID_KEY = 'currentChatHistoryId'

export interface ChatSessionData {
  messageList?: ChatMessage[]
  systemRole?: string
  historyId?: string
}

// 恢复上次会话：systemRole 与 historyId 由 ChatRoot 的 pagehide 钩子写入 sessionStorage，
// 消息本体从 IndexedDB 的历史记录里取回（发送时已即时持久化，不依赖 pagehide 落盘）。
export const loadChatSession = async(): Promise<ChatSessionData> => {
  if (typeof sessionStorage === 'undefined')
    return {}

  let systemRole: string | undefined
  let historyId: string | undefined
  try {
    systemRole = sessionStorage.getItem(SYSTEM_ROLE_KEY) ?? undefined
    historyId = sessionStorage.getItem(HISTORY_ID_KEY) ?? undefined
  } catch (error) {
    console.error('Failed to read session from sessionStorage:', error)
  }

  if (!historyId) return { systemRole }

  // 等待历史列表从 IndexedDB 加载完成，否则 getHistoryById 读到的是空列表
  await historyLoaded
  const history = getHistoryById(historyId)
  if (!history) return { systemRole }

  return { messageList: history.messages, systemRole, historyId }
}
