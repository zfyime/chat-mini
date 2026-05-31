import { createSignal, onCleanup, onMount } from 'solid-js'

// 联网搜索开关：放在 Header 模型选择器旁，状态持久化到 localStorage，
// 通过 CustomEvent('web-search-change') 向 ChatRoot 派发。
export default () => {
  const [enabled, setEnabled] = createSignal(false)
  const [isStreaming, setIsStreaming] = createSignal(false)

  onMount(() => {
    const saved = localStorage.getItem('web-search-enabled')
    if (saved === '1') setEnabled(true)

    const handleStreaming = ((e: CustomEvent) => {
      setIsStreaming(!!e.detail.streaming)
    }) as EventListener
    window.addEventListener('streaming-state-change', handleStreaming)

    onCleanup(() => {
      window.removeEventListener('streaming-state-change', handleStreaming)
    })
  })

  const toggle = () => {
    if (isStreaming()) return
    const next = !enabled()
    setEnabled(next)
    localStorage.setItem('web-search-enabled', next ? '1' : '0')
    window.dispatchEvent(new CustomEvent('web-search-change', { detail: next }))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled() ? '联网搜索：已开启' : '联网搜索：已关闭'}
      aria-pressed={enabled()}
      class="fi gap-1 h-10 px-2 rounded-md text-sm transition-colors select-none"
      classList={{
        'op-30 cursor-not-allowed': isStreaming(),
        'cursor-pointer hover:bg-slate/10': !isStreaming(),
      }}
      disabled={isStreaming()}
      style={{ color: enabled() ? '#2563eb' : '#858585' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="flex-shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span class="text-xs">联网</span>
    </button>
  )
}
