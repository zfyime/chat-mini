import { createSignal } from 'solid-js'
import { useDebounceFn } from 'solidjs-use'
import { CONFIG } from '@/config/constants'
import { chatDB, fallbackStorage } from '@/utils/indexedDB'
import type { ChatHistory, ChatMessage } from '@/types'

// --- Helpers ---
const sanitizeMessagesForStorage = (messages: ChatMessage[]) =>
  messages.map(message => ({
    ...message,
    attachments: message.attachments?.map(attachment => ({
      ...attachment,
      url: attachment.url && attachment.url.startsWith('blob:') ? undefined : attachment.url,
    })),
  }))

// --- State ---
const [historyList, setHistoryList] = createSignal<ChatHistory[]>([])

// --- Effects ---
// Load from IndexedDB on startup
const loadHistoryFromStorage = async() => {
  try {
    // 尝试使用 IndexedDB
    if (chatDB.isSupported()) {
      await chatDB.init()
      const histories = await chatDB.getAllHistory()
      const sanitized = histories.map(history => ({
        ...history,
        messages: sanitizeMessagesForStorage(history.messages),
      }))
      setHistoryList(sanitized)
    } else {
      // 降级到 localStorage
      const saved = fallbackStorage.getItem('chatHistoryList')
      if (saved) {
        const sanitized = saved.map((history: ChatHistory) => ({
          ...history,
          messages: sanitizeMessagesForStorage(history.messages),
        }))
        setHistoryList(sanitized)
      }
    }
  } catch (e) {
    console.error('Failed to load chat history:', e)
    // 降级到 localStorage
    const saved = fallbackStorage.getItem('chatHistoryList')
    if (saved) {
      const sanitized = saved.map((history: ChatHistory) => ({
        ...history,
        messages: sanitizeMessagesForStorage(history.messages),
      }))
      setHistoryList(sanitized)
    }
  }
}

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

// Initial load - 在模块初始化时直接调用，避免 createEffect 在 createRoot 外部
if (typeof window !== 'undefined')
  loadHistoryFromStorage()

const saveHistoryList = useDebounceFn(async() => {
  // debounce 触发时直接读最新 historyList()
  const list = historyList()
  try {
    // 尝试使用 IndexedDB
    if (chatDB.isSupported()) {
      await chatDB.bulkSaveHistory(list)

      // 定期清理
      if (Math.random() < CONFIG.HISTORY_CLEANUP_PROBABILITY)
        chatDB.cleanup()
    } else {
      // 降级到 localStorage
      fallbackStorage.setItem('chatHistoryList', list)
    }
  } catch (e) {
    console.error('Failed to save chat history:', e)
    // 降级到 localStorage
    try {
      fallbackStorage.setItem('chatHistoryList', list)
    } catch (fallbackError) {
      console.error('Fallback to localStorage also failed:', fallbackError)
    }
  }
}, CONFIG.SAVE_DEBOUNCE_TIME)

// --- Public Actions ---
export const deleteHistory = async(id: string) => {
  try {
    // 从 IndexedDB 删除
    if (chatDB.isSupported())
      await chatDB.deleteHistory(id)
  } catch (e) {
    console.error('Failed to delete history:', e)
  }
  // 更新内存中的列表并触发持久化（兜底）
  setHistoryList(historyList().filter(item => item.id !== id))
  saveHistoryList()
}

export const saveOrUpdateChat = async(messages: ChatMessage[], systemRole: string, existingId?: string) => {
  if (messages.length === 0) return

  const now = Date.now()
  const sanitizedMessages = sanitizeMessagesForStorage(messages)

  if (existingId) {
    // Update existing history（若内存里还没加载到该 id，则回退到创建新条目，避免静默丢失）
    const current = historyList()
    const hit = current.find(item => item.id === existingId)
    if (hit) {
      const updatedList = current.map(item =>
        item.id === existingId
          ? {
              ...item,
              title: generateTitle(messages),
              messages: sanitizedMessages,
              systemRole,
              updatedAt: now,
            }
          : item,
      )
      setHistoryList(updatedList)
      saveHistoryList()
      return existingId
    }
    // 未命中：fallthrough 到下方新增分支
  }

  // Create new history
  const id = existingId || generateUniqueId()
  const newHistory: ChatHistory = {
    id,
    title: generateTitle(messages),
    messages: sanitizedMessages,
    systemRole,
    createdAt: now,
    updatedAt: now,
  }

  const newList = [newHistory, ...historyList()]
  // Limit history count
  if (newList.length > CONFIG.HISTORY_LIST_LIMIT)
    newList.splice(CONFIG.HISTORY_LIST_LIMIT)

  setHistoryList(newList)
  saveHistoryList()
  return id
}

// --- Exported State ---
export { historyList, loadHistoryFromStorage }
