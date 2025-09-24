import { chatDB } from './indexedDB'
import type { ChatMessage } from '@/types'

const MESSAGE_KEY = 'messageList'
const SYSTEM_ROLE_KEY = 'systemRoleSettings'

export interface ChatSessionData {
  messageList?: ChatMessage[]
  systemRole?: string
}

const loadFromSessionStorage = (key: string) => {
  if (typeof sessionStorage === 'undefined')
    return undefined
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : undefined
  } catch (error) {
    console.error('Failed to read from sessionStorage:', error)
    return undefined
  }
}

const saveToSessionStorage = (key: string, value: unknown) => {
  if (typeof sessionStorage === 'undefined')
    return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to write to sessionStorage:', error)
  }
}

const saveStringToSessionStorage = (key: string, value: string) => {
  if (typeof sessionStorage === 'undefined')
    return
  try {
    sessionStorage.setItem(key, value)
  } catch (error) {
    console.error('Failed to write string to sessionStorage:', error)
  }
}

export const loadChatSession = async(): Promise<ChatSessionData> => {
  try {
    if (chatDB.isSupported()) {
      await chatDB.init()
      const [messageList, systemRole] = await Promise.all([
        chatDB.getSession(MESSAGE_KEY),
        chatDB.getSession(SYSTEM_ROLE_KEY),
      ])

      return {
        messageList: messageList ?? undefined,
        systemRole: systemRole ?? undefined,
      }
    }
  } catch (error) {
    console.error('Failed to load session data from IndexedDB:', error)
  }

  return {
    messageList: loadFromSessionStorage(MESSAGE_KEY),
    systemRole: (() => {
      if (typeof sessionStorage === 'undefined')
        return undefined
      try {
        return sessionStorage.getItem(SYSTEM_ROLE_KEY) ?? undefined
      } catch (error) {
        console.error('Failed to read system role from sessionStorage:', error)
        return undefined
      }
    })(),
  }
}

interface SaveChatSessionPayload {
  messageList: ChatMessage[]
  systemRole: string
}

export const saveChatSession = async({ messageList, systemRole }: SaveChatSessionPayload): Promise<void> => {
  try {
    if (chatDB.isSupported()) {
      await chatDB.init()
      await Promise.all([
        chatDB.saveSession(MESSAGE_KEY, messageList),
        chatDB.saveSession(SYSTEM_ROLE_KEY, systemRole),
      ])
      return
    }
  } catch (error) {
    console.error('Failed to save session data to IndexedDB:', error)
  }

  saveToSessionStorage(MESSAGE_KEY, messageList)
  saveStringToSessionStorage(SYSTEM_ROLE_KEY, systemRole)
}
