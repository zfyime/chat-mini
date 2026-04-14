import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { AVAILABLE_MODELS, CONFIG } from '@/config/constants'

export default () => {
  const [isOpen, setIsOpen] = createSignal(false)
  const [isStreaming, setIsStreaming] = createSignal(false)
  const [currentModel, setCurrentModel] = createSignal(
    localStorage.getItem('selected_model') || CONFIG.DEFAULT_MODEL,
  )

  const getModelName = (modelId: string) => {
    return AVAILABLE_MODELS.find(m => m.id === modelId)?.name || modelId
  }

  const selectModel = (modelId: string) => {
    setCurrentModel(modelId)
    localStorage.setItem('selected_model', modelId)
    window.dispatchEvent(new CustomEvent('model-change', { detail: modelId }))
    setIsOpen(false)
  }

  onMount(() => {
    const handleModelChange = ((e: CustomEvent) => {
      setCurrentModel(e.detail)
    }) as EventListener
    window.addEventListener('model-change', handleModelChange)

    // 流式输出时禁用模型切换
    const handleStreaming = ((e: CustomEvent) => {
      setIsStreaming(e.detail.streaming)
      if (e.detail.streaming) setIsOpen(false)
    }) as EventListener
    window.addEventListener('streaming-state-change', handleStreaming)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.model-selector'))
        setIsOpen(false)
    }
    document.addEventListener('click', handleClickOutside)

    onCleanup(() => {
      window.removeEventListener('model-change', handleModelChange)
      window.removeEventListener('streaming-state-change', handleStreaming)
      document.removeEventListener('click', handleClickOutside)
    })
  })

  return (
    <div class="model-selector relative">
      <button
        onClick={() => !isStreaming() && setIsOpen(!isOpen())}
        class="fi gap-1 h-10 px-2 rounded-md text-sm transition-colors select-none"
        classList={{
          'op-30 cursor-not-allowed': isStreaming(),
          'cursor-pointer hover:bg-slate/10': !isStreaming(),
        }}
        disabled={isStreaming()}
      >
        <span class="truncate max-w-[120px]" style={{ color: '#858585' }}>{getModelName(currentModel())}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#858585"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-transform duration-200 flex-shrink-0"
          classList={{ 'rotate-180': isOpen() }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Show when={isOpen()}>
        <div class="absolute top-full right-0 mt-1 py-1 min-w-[160px] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-50">
          <For each={AVAILABLE_MODELS}>
            {model => (
              <button
                onClick={() => selectModel(model.id)}
                class="fi gap-2 w-full text-left px-3 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                classList={{
                  'font-medium': currentModel() === model.id,
                  'op-50': currentModel() !== model.id,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="flex-shrink-0"
                  classList={{
                    'op-0': currentModel() !== model.id,
                  }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{model.name}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
