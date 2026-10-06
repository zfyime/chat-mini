import { CONFIG } from '@/config/constants'
import type { ChatHistory } from '@/types'

// 统一的 IDBRequest -> Promise 包装，顺带打出上下文相关的错误日志
const runRequest = <T>(request: IDBRequest<T>, errorLog: string): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.error(errorLog, request.error)
      reject(request.error)
    }
  })
}

class ChatDatabase {
  private dbName = 'ChatMiniDB'
  private version = 1
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    // 避免重复初始化
    if (this.initPromise) return this.initPromise
    if (this.db) return Promise.resolve()

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 创建对话历史存储
        if (!db.objectStoreNames.contains('chatHistory')) {
          const historyStore = db.createObjectStore('chatHistory', {
            keyPath: 'id',
          })
          historyStore.createIndex('updatedAt', 'updatedAt', { unique: false })
          historyStore.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  // 确保数据库已初始化
  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db)
      await this.init()
    if (!this.db)
      throw new Error('Failed to initialize database')
    return this.db
  }

  // 获取所有历史记录（按更新时间倒序）
  async getAllHistory(limit: number = CONFIG.HISTORY_LIST_LIMIT): Promise<ChatHistory[]> {
    const db = await this.ensureDb()
    const index = db.transaction(['chatHistory'], 'readonly').objectStore('chatHistory').index('updatedAt')

    // 游标逐条读取，读满 limit 后主动停止，避免把全库都取回来
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev') // 按更新时间倒序
      const results: ChatHistory[] = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor && results.length < limit) {
          results.push(cursor.value)
          cursor.continue()
        } else {
          resolve(results)
        }
      }

      request.onerror = () => {
        console.error('Failed to get history:', request.error)
        reject(request.error)
      }
    })
  }

  // 删除对话历史
  async deleteHistory(id: string): Promise<void> {
    const db = await this.ensureDb()
    const store = db.transaction(['chatHistory'], 'readwrite').objectStore('chatHistory')
    await runRequest(store.delete(id), 'Failed to delete history:')
  }

  // 批量保存历史（用于批量更新）
  async bulkSaveHistory(histories: ChatHistory[]): Promise<void> {
    const db = await this.ensureDb()
    const store = db.transaction(['chatHistory'], 'readwrite').objectStore('chatHistory')
    await Promise.all(histories.map(history => runRequest(store.put(history), 'Failed to save history:')))
  }

  // 清理过期数据
  async cleanup(): Promise<void> {
    try {
      const histories = await this.getAllHistory(Number.POSITIVE_INFINITY)
      // 只保留配置的最大数量
      if (histories.length > CONFIG.HISTORY_LIST_LIMIT) {
        const toDelete = histories.slice(CONFIG.HISTORY_LIST_LIMIT)
        for (const history of toDelete)
          await this.deleteHistory(history.id)
      }
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
  }

  // 检查是否支持 IndexedDB
  isSupported(): boolean {
    return typeof indexedDB !== 'undefined'
  }
}

// 导出单例
export const chatDB = new ChatDatabase()

// 导出降级到 localStorage 的工具函数
export const fallbackStorage = {
  setItem: (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('localStorage fallback failed:', e)
    }
  },

  getItem: (key: string): any => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch (e) {
      console.error('localStorage fallback failed:', e)
      return null
    }
  },

  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key)
    } catch (e) {
      console.error('localStorage fallback failed:', e)
    }
  },
}
