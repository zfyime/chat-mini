import { createEffect, createSignal } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { CONFIG } from '@/config/constants'
import type { ChatHistory, ChatMessage } from '@/types'

// --- State ---
const [historyList, setHistoryList] = createSignal<ChatHistory[]>([])

// --- Effects ---
// Load from localStorage on startup
const loadHistoryFromStorage = () => {
  try {
    const saved = localStorage.getItem('chatHistoryList')
    if (saved)
      setHistoryList(JSON.parse(saved))
  } catch (e) {
    console.error('Failed to load chat history:', e)
  }
}

// Initial load
createEffect(() => {
  loadHistoryFromStorage()
})

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

const saveHistoryList = useThrottleFn((list: ChatHistory[]) => {
  try {
    localStorage.setItem('chatHistoryList', JSON.stringify(list))
    setHistoryList(list)
  } catch (e) {
    console.error('Failed to save chat history:', e)
  }
}, CONFIG.SAVE_DEBOUNCE_TIME, false, true)

// --- Public Actions ---
export const deleteHistory = (id: string) => {
  const newList = historyList().filter(item => item.id !== id)
  saveHistoryList(newList)
}

export const saveOrUpdateChat = (messages: ChatMessage[], systemRole: string, existingId?: string) => {
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
    saveHistoryList(updatedList)
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

    saveHistoryList(newList)
    return id
  }
}

// --- Exported State ---
export const historyState = {
  historyList,
  loadHistoryFromStorage, // Export the reload function
}
