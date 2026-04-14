import { For, createSignal, onCleanup, onMount } from 'solid-js'
import { deleteHistory, historyState } from '@/store/historyStore'
import IconDelete from './icons/Delete'
import type { ChatHistory, ChatMessage } from '@/types'

interface Props {
  onLoadHistory: (messages: ChatMessage[], systemRole: string, historyId?: string) => void | Promise<void>
}

export default (props: Props) => {
  const [showHistory, setShowHistory] = createSignal(false)
  const { historyList, loadHistoryFromStorage } = historyState

  // 确保每次组件挂载时都重新加载历史数据，并监听全局切换事件
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

  // 格式化时间显示逻辑
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
      {/* 背景遮罩 - 纯色透明，无模糊 */}
      <div
        class="fixed inset-0 bg-black/40 dark:bg-black/60 z-[60] transition-opacity duration-300 ease-in-out"
        classList={{ 'opacity-0 pointer-events-none': !showHistory(), 'opacity-100': showHistory() }}
        onClick={() => setShowHistory(false)}
      />

      {/* 侧边抽屉 - 实色背景 */}
      <div
        class="fixed top-0 left-0 bottom-0 z-[70] w-[min(85vw,300px)] bg-[var(--c-bg)] border-r border-slate/10 flex flex-col transition-transform duration-400 cubic-bezier([0.4,0,0.2,1])"
        classList={{ '-translate-x-full': !showHistory(), 'translate-x-0': showHistory() }}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 - 标题与关闭按钮 */}
        <div class="px-6 py-8 flex justify-between items-center">
          <div class="fi gap-2">
            <span class="text-xl font-bold gpt-title">历史</span>
            <span class="text-xl font-bold gpt-subtitle text-slate/60">对话</span>
          </div>
          <button
            onClick={() => setShowHistory(false)}
            class="p-2 hover:bg-slate/10 rounded-xl transition-all active:scale-90 text-slate/60"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            ><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 列表区域 - 滚动容器 */}
        <div class="flex-1 overflow-y-auto px-3 custom-scrollbar">
          {historyList().length === 0
            ? (
              <div class="flex flex-col items-center justify-center h-full p-8 text-center op-30">
                <div class="text-4xl mb-3">💬</div>
                <p class="text-sm font-medium">还没有开始对话</p>
              </div>
              )
            : (
              <div class="flex flex-col gap-2 pb-8">
                <For each={historyList()}>
                  {history => (
                    <div
                      class="px-4 py-3.5 rounded-2xl hover:bg-slate/6 cursor-pointer transition-all group relative border border-transparent hover:border-slate/5"
                      onClick={() => loadHistory(history)}
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-medium text-[var(--c-fg)] truncate group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                            {history.title}
                          </div>
                          <div class="text-[11px] text-slate/40 mt-1 flex items-center gap-2">
                            <span>{formatTime(history.createdAt)}</span>
                            <span class="w-1 h-1 rounded-full bg-slate/20" />
                            <span>{history.messages.length} 消息</span>
                          </div>
                        </div>
                        <button
                          class="opacity-0 group-hover:opacity-100 p-2 text-slate/30 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
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

        {/* 底部 - 极简标识 */}
        <div class="p-6">
          <div class="px-4 py-3 rounded-2xl bg-slate/5 border border-slate/5 text-center">
            <span class="text-[10px] text-slate/40 font-bold tracking-widest uppercase">Chat Mini History</span>
          </div>
        </div>
      </div>
    </>
  )
}
