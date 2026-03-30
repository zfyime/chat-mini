import { For, createSignal, onMount, onCleanup } from 'solid-js'
import { deleteHistory, historyState } from '@/store/historyStore'
import IconDelete from './icons/Delete'
import type { ChatHistory, ChatMessage } from '@/types'

interface Props {
  onLoadHistory: (messages: ChatMessage[], systemRole: string, historyId?: string) => void | Promise<void>
}

export default (props: Props) => {
  const [showHistory, setShowHistory] = createSignal(false)
  const { historyList, loadHistoryFromStorage } = historyState

  // 确保每次组件挂载时都重新加载历史数据
  onMount(() => {
    loadHistoryFromStorage()
    const handleToggleHistory = () => setShowHistory(!showHistory())
    window.addEventListener('toggle-history', handleToggleHistory)
    onCleanup(() => {
      window.removeEventListener('toggle-history', handleToggleHistory)
    })
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
      {/* 背景遮罩 */}
      <div
        class="fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300 ease-in-out"
        classList={{ 'opacity-0 pointer-events-none': !showHistory(), 'opacity-100': showHistory() }}
        onClick={() => setShowHistory(false)}
      />

      {/* 侧边抽屉 */}
      <div
        class="fixed top-0 left-0 bottom-0 z-[70] w-[min(90vw,320px)] bg-white dark:bg-gray-900 shadow-2xl border-r border-gray-200 dark:border-gray-800 flex flex-col transition-transform duration-300 ease-in-out"
        classList={{ '-translate-x-full': !showHistory(), 'translate-x-0': showHistory() }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div class="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
          <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span class="i-carbon-time text-xl" />
            历史对话
          </h3>
          <button
            onClick={() => setShowHistory(false)}
            class="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* 列表区域 */}
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          {historyList().length === 0
            ? (
              <div class="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
                <div class="i-carbon-chat-off text-4xl mb-2 opacity-20" />
                <p>暂无历史对话</p>
              </div>
              )
            : (
              <div class="py-2">
                <For each={historyList()}>
                  {history => (
                    <div
                      class="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer transition-all group border-l-4 border-transparent"
                      classList={{ 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500': false /* 可以在此添加激活态判断 */ }}
                      onClick={() => loadHistory(history)}
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-500 transition-colors">
                            {history.title}
                          </div>
                          <div class="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                            {formatTime(history.createdAt)} • {history.messages.length} 条
                          </div>
                        </div>
                        <button
                          class="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                          onClick={e => handleDelete(history.id, e)}
                          title="删除"
                        >
                          <IconDelete />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              )}
        </div>

        {/* 底部提示（可选） */}
        <div class="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
          <p class="text-[10px] text-gray-400 text-center uppercase tracking-widest">
            Local Storage Only
          </p>
        </div>
      </div>
    </>
  )
}
