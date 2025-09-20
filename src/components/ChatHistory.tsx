import { For, createSignal, onMount } from 'solid-js'
import { deleteHistory, historyState } from '@/store/historyStore'
import IconDelete from './icons/Delete'
import IconHistory from './icons/History'
import type { ChatHistory, ChatMessage } from '@/types'

interface Props {
  onLoadHistory: (messages: ChatMessage[], systemRole: string, historyId?: string) => void
}

export default (props: Props) => {
  const [showHistory, setShowHistory] = createSignal(false)
  const { historyList, loadHistoryFromStorage } = historyState

  // 确保每次组件挂载时都重新加载历史数据
  onMount(() => {
    loadHistoryFromStorage()
  })

  const handleDelete = (id: string, e: Event) => {
    e.stopPropagation()
    deleteHistory(id)
  }

  const loadHistory = (history: ChatHistory) => {
    props.onLoadHistory(history.messages, history.systemRole, history.id)
    setShowHistory(false)
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0)
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    else if (days === 1)
      return '昨天'
    else if (days < 7)
      return `${days}天前`
    else
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      {/* 历史对话按钮 */}
      <div class="fixed bottom-5 left-5 sm:left-5 left-3 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90">
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
          onClick={e => e.stopPropagation()}
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">历史对话</h3>
          </div>

          <div class="overflow-y-auto max-h-80">
            {historyList().length === 0
              ? (
                <div class="p-4 text-center text-gray-500 dark:text-gray-400">
                  暂无历史对话
                </div>
                )
              : (
                <For each={historyList()}>
                  {history => (
                    <div
                      class="p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors group"
                      onClick={() => loadHistory(history)}
                    >
                      <div class="flex items-center justify-between">
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
                          onClick={e => handleDelete(history.id, e)}
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
    </>
  )
}
