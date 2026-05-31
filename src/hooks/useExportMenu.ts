import { createSignal, onCleanup, onMount } from 'solid-js'
import { exportChat } from '@/utils/exportUtils'
import type { ChatMessage } from '@/types'

export const useExportMenu = (
  messageList: () => ChatMessage[],
  systemRole: () => string,
) => {
  const [showExportMenu, setShowExportMenu] = createSignal(false)

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[title="导出对话"]') && !target.closest('.export-menu'))
        setShowExportMenu(false)
    }
    document.addEventListener('click', handleClickOutside)
    onCleanup(() => document.removeEventListener('click', handleClickOutside))
  })

  const toggleExportMenu = (e: MouseEvent) => {
    e.stopPropagation()
    setShowExportMenu(!showExportMenu())
  }

  const handleExport = (format: 'markdown' | 'json' | 'text') => {
    try {
      if (messageList().length === 0) return
      exportChat(messageList(), systemRole(), format)
      setShowExportMenu(false)
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  return { showExportMenu, toggleExportMenu, handleExport }
}
