import { createSignal, createEffect, For } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { CONFIG } from '@/config/constants'
import type { ChatHistory, ChatMessage } from '@/types'
import IconDelete from './icons/Delete'
import IconHistory from './icons/History'

interface Props {
  onLoadHistory: (messages: ChatMessage[], systemRole: string, historyId?: string) => void
}

export default (props: Props) => {
  const [showHistory, setShowHistory] = createSignal(false)
  const [historyList, setHistoryList] = createSignal<ChatHistory[]>([])

  // 从localStorage加载历史对话
  createEffect(() => {
    try {
      const saved = localStorage.getItem('chatHistoryList')
      if (saved) {
        setHistoryList(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Failed to load chat history:', e)
    }
  })

  // 保存历史对话到localStorage（防抖版本）
  const saveHistoryList = useThrottleFn((list: ChatHistory[]) => {
    try {
      localStorage.setItem('chatHistoryList', JSON.stringify(list))
      setHistoryList(list)
    } catch (e) {
      console.error('Failed to save chat history:', e)
    }
  }, CONFIG.SAVE_DEBOUNCE_TIME, false, true)

  // 删除历史对话
  const deleteHistory = (id: string, e: Event) => {
    e.stopPropagation()
    const newList = historyList().filter(item => item.id !== id)
    saveHistoryList(newList)
  }

  // 加载历史对话
  const loadHistory = (history: ChatHistory) => {
    props.onLoadHistory(history.messages, history.systemRole, history.id)
    setShowHistory(false)
  }

  // 生成对话标题（取第一条用户消息的前20个字符）
  const generateTitle = (messages: ChatMessage[]) => {
    const firstUserMessage = messages.find(msg => msg.role === 'user')
    if (firstUserMessage) {
      return firstUserMessage.content.slice(0, 20) + (firstUserMessage.content.length > 20 ? '...' : '')
    }
    return '新对话'
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return '昨天'
    } else if (days < 7) {
      return `${days}天前`
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  // 保存或更新对话历史
  const saveOrUpdateChat = (messages: ChatMessage[], systemRole: string, existingId?: string) => {
    if (messages.length === 0) return
    
    const now = Date.now()
    
    if (existingId) {
      // 更新现有历史记录
      const updatedList = historyList().map(item => 
        item.id === existingId 
          ? {
              ...item,
              title: generateTitle(messages),
              messages: [...messages],
              systemRole,
              updatedAt: now
            }
          : item
      )
      saveHistoryList(updatedList)
      return existingId
    } else {
      // 创建新的历史记录
      const id = now.toString()
      const newHistory: ChatHistory = {
        id,
        title: generateTitle(messages),
        messages: [...messages],
        systemRole,
        createdAt: now,
        updatedAt: now
      }
      
      const newList = [newHistory, ...historyList()]
      // 最多保存历史记录
      if (newList.length > CONFIG.MAX_HISTORY_COUNT) {
        newList.splice(CONFIG.MAX_HISTORY_COUNT)
      }
      
      saveHistoryList(newList)
      return id
    }
  }

  return (
    <>
      {/* 历史对话按钮 */}
      <div class="fixed bottom-16 left-5 sm:left-5 left-3 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90">
        <button 
          class="p-2.5 text-base" 
          title="历史对话" 
          type="button" 
          onClick={() => setShowHistory(!showHistory())}
        >
          <IconHistory />
        </button>
      </div>

      {/* 历史对话弹窗 */}
      <div
        class="fixed inset-0 bg-black/50 z-50 transition-all"
        classList={{ 'opacity-0 pointer-events-none': !showHistory() }}
        onClick={() => setShowHistory(false)}
      >
        <div 
          class="fixed left-4 right-4 sm:left-4 sm:right-auto bottom-20 sm:w-80 w-auto max-h-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">历史对话</h3>
          </div>
          
          <div class="overflow-y-auto max-h-80">
            {historyList().length === 0 ? (
              <div class="p-4 text-center text-gray-500 dark:text-gray-400">
                暂无历史对话
              </div>
            ) : (
              <For each={historyList()}>
                {(history) => (
                  <div 
                    class="p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors group"
                    onClick={() => loadHistory(history)}
                  >
                    <div class="flex items-start justify-between">
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {history.title}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {formatTime(history.createdAt)} • {history.messages.length} 条消息
                        </div>
                      </div>
                      <button
                        class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                        onClick={(e) => deleteHistory(history.id, e)}
                        title="删除"
                      >
                        <IconDelete />
                      </button>
                    </div>
                  </div>
                )}
              </For>
            )}
          </div>
        </div>
      </div>

      {/* 暴露保存方法给父组件 */}
      <div style="display: none" ref={(el) => {
        // 将保存方法挂载到全局，供Generator组件调用
        if (el) {
          (window as any).saveCurrentChatHistory = saveOrUpdateChat
        }
      }}></div>
    </>
  )
}