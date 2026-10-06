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

// 读取时同样清洗：库里可能残留 blob: url（页面重载后已失效）
const sanitizeHistories = (list: ChatHistory[]) =>
  list.map(history => ({
    ...history,
    messages: sanitizeMessagesForStorage(history.messages),
  }))

const loadFromFallback = () => {
  const saved = fallbackStorage.getItem('chatHistoryList')
  // 降级数据可能损坏为非数组，非数组直接视为无历史
  if (Array.isArray(saved)) setHistoryList(sanitizeHistories(saved))
}

// --- Effects ---
// Load from IndexedDB on startup
const loadHistoryFromStorage = async() => {
  try {
    // 尝试使用 IndexedDB，不支持则降级到 localStorage
    if (chatDB.isSupported()) {
      await chatDB.init()
      setHistoryList(sanitizeHistories(await chatDB.getAllHistory()))
    } else {
      loadFromFallback()
    }
  } catch (e) {
    console.error('Failed to load chat history:', e)
    loadFromFallback()
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
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

// Initial load - 在模块初始化时直接调用，避免 createEffect 在 createRoot 外部。
// 导出加载完成的 promise：依赖历史数据的调用方（如会话恢复）需要 await 它，
// 否则 IndexedDB 尚未读回时读到的 historyList 还是空的。
export const historyLoaded: Promise<void> = (async() => {
  if (typeof window !== 'undefined')
    await loadHistoryFromStorage()
})()

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
export const getHistoryById = (id: string): ChatHistory | undefined =>
  historyList().find(item => item.id === id)

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
export { historyList }
