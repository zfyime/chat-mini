import { createSignal } from 'solid-js'
import { saveOrUpdateChat } from '@/store/historyStore'
import type { ChatMessage } from '@/types'

export const useHistoryPersist = () => {
  const [isCurrentChatModified, setIsCurrentChatModified] = createSignal(false)
  const [currentChatHistoryId, setCurrentChatHistoryId] = createSignal<string>()

  // 异步持久化并记住当前会话对应的 historyId；messages 为空时跳过
  const persist = async(messages: ChatMessage[], systemRole: string) => {
    if (messages.length === 0) return
    const historyId = await saveOrUpdateChat(messages, systemRole, currentChatHistoryId())
    if (historyId) setCurrentChatHistoryId(historyId)
  }

  const resetCurrentChat = () => {
    setIsCurrentChatModified(false)
    setCurrentChatHistoryId()
  }

  const adoptHistory = (historyId?: string) => {
    setCurrentChatHistoryId(historyId)
    setIsCurrentChatModified(false)
  }

  const markModified = () => setIsCurrentChatModified(true)

  return {
    isCurrentChatModified,
    currentChatHistoryId,
    persist,
    resetCurrentChat,
    adoptHistory,
    markModified,
  }
}
