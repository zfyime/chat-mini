import { createSignal } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { CONFIG } from '@/config/constants'
import { chatDB, fallbackStorage } from '@/utils/indexedDB'
import type { ChatHistory, ChatMessage } from '@/types'

// --- State ---
const [historyList, setHistoryList] = createSignal<ChatHistory[]>([])

// --- Effects ---
// Load from IndexedDB on startup
const loadHistoryFromStorage = async () => {
  try {
    // 尝试使用 IndexedDB
    if (chatDB.isSupported()) {
      await chatDB.init()
      const histories = await chatDB.getAllHistory()
      setHistoryList(histories)
    } else {
      // 降级到 localStorage
      const saved = fallbackStorage.getItem('chatHistoryList')
      if (saved)
        setHistoryList(saved)
    }
  } catch (e) {
    console.error('Failed to load chat history:', e)
    // 降级到 localStorage
    const saved = fallbackStorage.getItem('chatHistoryList')
    if (saved)
      setHistoryList(saved)
  }
}

// Initial load - 在模块初始化时直接调用，避免 createEffect 在 createRoot 外部
loadHistoryFromStorage()

// --- Private Actions ---
const generateTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find(msg => msg.role === 'user')
  if (firstUserMessage)
    return firstUserMessage.content.slice(0, 25) + (firstUserMessage.content.length > 25 ? '...' : '')

  return '新对话'
}

const generateUniqueId = () => {
  // Try to use crypto.randomUUID() first, fall back to timestamp + random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID()
    } catch (e) {
      console.error('crypto.randomUUID() failed, falling back to timestamp-based ID')
    }
  }
  // Fallback: timestamp + random number for reasonable uniqueness
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

const saveHistoryList = useThrottleFn(async (list: ChatHistory[]) => {
  try {
    // 尝试使用 IndexedDB
    if (chatDB.isSupported()) {
      await chatDB.bulkSaveHistory(list)
      setHistoryList(list)

      // 定期清理（10%概率）
      if (Math.random() < 0.1) {
        chatDB.cleanup()
      }
    } else {
      // 降级到 localStorage
      fallbackStorage.setItem('chatHistoryList', list)
      setHistoryList(list)
    }
  } catch (e) {
    console.error('Failed to save chat history:', e)
    // 降级到 localStorage
    try {
      fallbackStorage.setItem('chatHistoryList', list)
      setHistoryList(list)
    } catch (fallbackError) {
      console.error('Fallback to localStorage also failed:', fallbackError)
    }
  }
}, CONFIG.SAVE_DEBOUNCE_TIME, true, true)

// --- Public Actions ---
export const deleteHistory = async (id: string) => {
  try {
    // 从 IndexedDB 删除
    if (chatDB.isSupported()) {
      await chatDB.deleteHistory(id)
    }
    // 更新内存中的列表
    const newList = historyList().filter(item => item.id !== id)
    await saveHistoryList(newList)
  } catch (e) {
    console.error('Failed to delete history:', e)
    // 降级处理
    const newList = historyList().filter(item => item.id !== id)
    saveHistoryList(newList)
  }
}

export const saveOrUpdateChat = async (messages: ChatMessage[], systemRole: string, existingId?: string) => {
  if (messages.length === 0) return

  const now = Date.now()

  if (existingId) {
    // Update existing history
    const updatedList = historyList().map(item =>
      item.id === existingId
        ? {
            ...item,
            title: generateTitle(messages),
            messages: [...messages],
            systemRole,
            updatedAt: now,
          }
        : item,
    )
    await saveHistoryList(updatedList)
    return existingId
  } else {
    // Create new history
    const id = generateUniqueId()
    const newHistory: ChatHistory = {
      id,
      title: generateTitle(messages),
      messages: [...messages],
      systemRole,
      createdAt: now,
      updatedAt: now,
    }

    const newList = [newHistory, ...historyList()]
    // Limit history count
    if (newList.length > CONFIG.MAX_HISTORY_COUNT)
      newList.splice(CONFIG.MAX_HISTORY_COUNT)

    await saveHistoryList(newList)
    return id
  }
}

// --- Exported State ---
export const historyState = {
  historyList,
  loadHistoryFromStorage, // Export the reload function
}
