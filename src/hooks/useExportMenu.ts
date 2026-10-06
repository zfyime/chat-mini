import { createSignal } from 'solid-js'
import { useClickOutside } from '@/hooks/useClickOutside'
import { exportChat } from '@/utils/exportUtils'
import type { ChatMessage } from '@/types'

export const useExportMenu = (
  messageList: () => ChatMessage[],
  systemRole: () => string,
) => {
  const [showExportMenu, setShowExportMenu] = createSignal(false)
  // 点击菜单外部关闭；ref 绑定到导出按钮 + 菜单的公共容器上
  const menuRef = useClickOutside(() => setShowExportMenu(false))

  const handleExport = (format: 'markdown' | 'json' | 'text') => {
    try {
      if (messageList().length === 0) return
      exportChat(messageList(), systemRole(), format)
      setShowExportMenu(false)
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  return { showExportMenu, setShowExportMenu, menuRef, handleExport }
}
