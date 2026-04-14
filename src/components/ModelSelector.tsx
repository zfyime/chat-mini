import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { AVAILABLE_MODELS, CONFIG } from '@/config/constants'

export default () => {
  const [isOpen, setIsOpen] = createSignal(false)
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

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.model-selector'))
        setIsOpen(false)
    }
    document.addEventListener('click', handleClickOutside)

    onCleanup(() => {
      window.removeEventListener('model-change', handleModelChange)
      document.removeEventListener('click', handleClickOutside)
    })
  })

  return (
    <div class="model-selector relative">
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="fi gap-1 px-2 py-1 rounded-md text-sm op-60 hover:op-80 hover:bg-slate/10 transition-all cursor-pointer select-none"
      >
        <span class="truncate max-w-[120px]">{getModelName(currentModel())}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-transform duration-200"
          classList={{ 'rotate-180': isOpen() }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <Show when={isOpen()}>
        <div class="absolute top-full right-0 mt-1 py-1 min-w-[160px] rounded-lg border border-slate/15 bg-[var(--c-bg)] shadow-lg z-50">
          <For each={AVAILABLE_MODELS}>
            {model => (
              <button
                onClick={() => selectModel(model.id)}
                class="w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-slate/10"
                classList={{
                  'text-emerald-500 font-medium': currentModel() === model.id,
                  'op-70': currentModel() !== model.id,
                }}
              >
                {model.name}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
