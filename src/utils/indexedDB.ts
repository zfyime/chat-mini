import { CONFIG } from '@/config/constants'
import type { ChatHistory } from '@/types'

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

        // 创建临时会话存储（替代 sessionStorage）
        if (!db.objectStoreNames.contains('tempSession'))
          db.createObjectStore('tempSession', { keyPath: 'key' })

        // 创建设置存储
        if (!db.objectStoreNames.contains('settings'))
          db.createObjectStore('settings', { keyPath: 'key' })
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

  // 保存或更新对话历史
  async saveHistory(history: ChatHistory): Promise<void> {
    const db = await this.ensureDb()
    const tx = db.transaction(['chatHistory'], 'readwrite')
    const store = tx.objectStore('chatHistory')

    return new Promise((resolve, reject) => {
      const request = store.put(history)
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to save history:', request.error)
        reject(request.error)
      }
    })
  }

  // 获取所有历史记录（按更新时间倒序）
  async getAllHistory(limit: number = CONFIG.MAX_HISTORY_COUNT): Promise<ChatHistory[]> {
    const db = await this.ensureDb()
    const tx = db.transaction(['chatHistory'], 'readonly')
    const store = tx.objectStore('chatHistory')
    const index = store.index('updatedAt')

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
    const tx = db.transaction(['chatHistory'], 'readwrite')
    const store = tx.objectStore('chatHistory')

    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to delete history:', request.error)
        reject(request.error)
      }
    })
  }

  // 批量保存历史（用于批量更新）
  async bulkSaveHistory(histories: ChatHistory[]): Promise<void> {
    const db = await this.ensureDb()
    const tx = db.transaction(['chatHistory'], 'readwrite')
    const store = tx.objectStore('chatHistory')

    const promises = histories.map(history =>
      new Promise<void>((resolve, reject) => {
        const request = store.put(history)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
    )

    await Promise.all(promises)
  }

  // 保存临时会话数据
  async saveSession(key: string, value: any): Promise<void> {
    const db = await this.ensureDb()
    const tx = db.transaction(['tempSession'], 'readwrite')
    const store = tx.objectStore('tempSession')

    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, timestamp: Date.now() })
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to save session:', request.error)
        reject(request.error)
      }
    })
  }

  // 获取临时会话数据
  async getSession(key: string): Promise<any> {
    const db = await this.ensureDb()
    const tx = db.transaction(['tempSession'], 'readonly')
    const store = tx.objectStore('tempSession')

    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }
      request.onerror = () => {
        console.error('Failed to get session:', request.error)
        reject(request.error)
      }
    })
  }

  // 清理临时会话数据
  async clearSession(): Promise<void> {
    const db = await this.ensureDb()
    const tx = db.transaction(['tempSession'], 'readwrite')
    const store = tx.objectStore('tempSession')

    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to clear session:', request.error)
        reject(request.error)
      }
    })
  }

  // 保存设置
  async saveSetting(key: string, value: any): Promise<void> {
    const db = await this.ensureDb()
    const tx = db.transaction(['settings'], 'readwrite')
    const store = tx.objectStore('settings')

    return new Promise((resolve, reject) => {
      const request = store.put({ key, value })
      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to save setting:', request.error)
        reject(request.error)
      }
    })
  }

  // 获取设置
  async getSetting(key: string): Promise<any> {
    const db = await this.ensureDb()
    const tx = db.transaction(['settings'], 'readonly')
    const store = tx.objectStore('settings')

    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }
      request.onerror = () => {
        console.error('Failed to get setting:', request.error)
        reject(request.error)
      }
    })
  }

  // 清理过期数据
  async cleanup(): Promise<void> {
    try {
      const histories = await this.getAllHistory(Number.POSITIVE_INFINITY)
      // 只保留配置的最大数量
      if (histories.length > CONFIG.MAX_HISTORY_COUNT) {
        const toDelete = histories.slice(CONFIG.MAX_HISTORY_COUNT)
        for (const history of toDelete)
          await this.deleteHistory(history.id)
      }

      // 清理过期的临时会话（超过24小时）
      const db = await this.ensureDb()
      const tx = db.transaction(['tempSession'], 'readwrite')
      const store = tx.objectStore('tempSession')
      const now = Date.now()
      const dayAgo = now - 24 * 60 * 60 * 1000

      const request = store.openCursor()
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          if (cursor.value.timestamp < dayAgo)
            cursor.delete()
          cursor.continue()
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
  }

  // 检查是否支持 IndexedDB
  isSupported(): boolean {
    return typeof indexedDB !== 'undefined'
  }

  // 关闭数据库连接
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initPromise = null
    }
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
