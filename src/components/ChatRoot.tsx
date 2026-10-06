import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { CONFIG } from '@/config/constants'
import { cleanupFileUrl } from '@/utils/fileUtils'
import { loadChatSession } from '@/utils/currentChatStore'
import { useAtom } from '@/hooks/useAtom'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useChatStream } from '@/hooks/useChatStream'
import { useHistoryPersist } from '@/hooks/useHistoryPersist'
import { useExportMenu } from '@/hooks/useExportMenu'
import {
  currentModel as currentModelAtom,
  initUiStore,
  setHasMessages,
  setWebSearchEnabled,
  temperature as temperatureAtom,
  webSearchEnabled as webSearchEnabledAtom,
} from '@/store/uiStore'
import IconClear from './icons/Clear'
import IconArrowDown from './icons/ArrowDown'
import IconArrowUp from './icons/ArrowUp'
import IconStop from './icons/Stop'
import IconExport from './icons/Export'
import IconGlobe from './icons/Globe'
import MessageItem from './MessageItem'
import TypingIndicator from './TypingIndicator'
import SystemRoleSettings from './SystemRoleSettings'
import ErrorMessageItem from './ErrorMessageItem'
import ChatHistory from './ChatHistory'
import FileUpload from './FileUpload'
import FilePreview from './FilePreview'
import type { ChatMessage, FileAttachment } from '@/types'

export default () => {
  let inputRef: HTMLTextAreaElement
  // 显式标注 string：CONFIG 为 as const，不标注会把 signal 收窄成字面量类型
  const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal<string>(CONFIG.DEFAULT_SYSTEM_ROLE)
  const [systemRoleEditing, setSystemRoleEditing] = createSignal(false)
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])
  // 入场动画开关：初始加载/切换历史期间为 false，避免整屏消息一起淡入；加载完成后开启，只有之后的新消息才有动画
  const [entranceReady, setEntranceReady] = createSignal(false)
  const { isStick, setStick, instantToBottom, isAtBottom } = useStickToBottom({
    threshold: CONFIG.SCROLL_THRESHOLD,
  })
  // 温度、模型、联网开关统一由 uiStore 持有，避免与 Header 下拉、设置面板三处各存一份
  const temperature = useAtom(temperatureAtom)
  const chatModel = useAtom(currentModelAtom)
  const webSearchEnabled = useAtom(webSearchEnabledAtom)
  const [pendingAttachments, setPendingAttachments] = createSignal<FileAttachment[]>([])

  // 消息列表非空即让 Header 吸顶；集中派生，替代原先各处手动派发的 has-messages 事件
  createEffect(() => setHasMessages(messageList().length > 0))

  const {
    isCurrentChatModified,
    currentChatHistoryId,
    persist,
    resetCurrentChat,
    adoptHistory,
    markModified,
  } = useHistoryPersist()

  const {
    currentAssistantMessage,
    currentAssistantThinkMessage,
    currentAssistantToolMessage,
    loading,
    currentError,
    resetStreamingBuffers,
    requestWithLatestMessage,
    stopStreamFetch,
  } = useChatStream({
    messageList,
    setMessageList,
    systemRole: currentSystemRoleSettings,
    model: chatModel,
    temperature,
    webSearchEnabled,
    onChunk: () => { isStick() && instantToBottom() },
    onArchived: (messages) => {
      markModified()
      persist(messages, currentSystemRoleSettings())
      if (!('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0))
        inputRef.focus()
    },
  })

  const { showExportMenu, setShowExportMenu, menuRef, handleExport } = useExportMenu(messageList, currentSystemRoleSettings)

  // 联网搜索开关：编辑系统角色或正在流式输出时禁用（持久化由 uiStore 负责）
  const toggleWebSearch = () => {
    if (systemRoleEditing() || loading()) return
    setWebSearchEnabled(!webSearchEnabled())
  }

  const cleanupMessageAttachments = (message: ChatMessage) => {
    message.attachments?.forEach(attachment => cleanupFileUrl(attachment.url))
  }

  const cleanupMessageListAttachments = (messages: ChatMessage[]) => {
    messages.forEach(cleanupMessageAttachments)
  }

  onMount(() => {
    // 恢复上次选择的模型与联网开关（SSR 阶段读不到 localStorage，故在挂载后统一初始化）
    initUiStore()

    const loadSessionData = async() => {
      const session = await loadChatSession()
      if (session.messageList?.length)
        setMessageList(session.messageList)
      if (session.systemRole)
        setCurrentSystemRoleSettings(session.systemRole)
      // 上次会话对应的历史条目存在时直接采纳，让后续修改更新同一条而非新建
      if (session.historyId)
        adoptHistory(session.historyId)
      // 初始消息不做入场动画，加载完成后再开启，使后续新消息才有动画
      setTimeout(() => {
        setStick(isAtBottom())
        setEntranceReady(true)
      })
    }
    loadSessionData()

    window.addEventListener('pagehide', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('pagehide', handleBeforeUnload)
      pendingAttachments().forEach(file => cleanupFileUrl(file.url))
    })
  })

  const deleteMessage = (index: number) => {
    const messages = messageList()
    const targetMessage = messages[index]
    if (targetMessage) cleanupMessageAttachments(targetMessage)

    const updatedMessages = messages.filter((_, i) => i !== index)
    setMessageList(updatedMessages)

    markModified()
    persist(updatedMessages, currentSystemRoleSettings())
  }

  const editMessage = (index: number, newContent: string) => {
    // 流式进行中拒绝操作，避免截断消息列表等破坏性变更
    if (loading()) return

    const messages = messageList()
    for (let i = index + 1; i < messages.length; i++)
      cleanupMessageAttachments(messages[i])

    const updatedMessage = { ...messages[index], content: newContent }
    const updatedMessages = [...messages.slice(0, index), updatedMessage]
    setMessageList(updatedMessages)

    // 编辑后同样即时持久化，随后截断的上下文以这条消息为最新
    markModified()
    persist(updatedMessages, currentSystemRoleSettings())
    setStick(true)
    requestWithLatestMessage()
    instantToBottom()
  }

  // pagehide 触发时无法 await 异步写盘，只同步写入轻量指针（historyId + systemRole）。
  // 消息本体在每次发送/归档时已即时持久化到 IndexedDB，刷新后由 loadChatSession 取回。
  const handleBeforeUnload = () => {
    try {
      sessionStorage.setItem('currentChatHistoryId', currentChatHistoryId() || '')
      sessionStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
    } catch (error) {
      console.error('Failed to persist chat session:', error)
    }
  }

  const handleButtonClick = async() => {
    // 流式进行中拒绝发送，避免清空输入、追加消息等前置副作用
    if (loading()) return

    const inputValue = inputRef.value
    if (!inputValue && pendingAttachments().length === 0) return

    inputRef.value = ''
    inputRef.style.height = 'auto'
    const attachments = [...pendingAttachments()]
    setPendingAttachments([])

    const newMessage: ChatMessage = {
      role: 'user',
      content: inputValue || '',
      think: '',
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    const updatedMessages = [...messageList(), newMessage]
    setMessageList(updatedMessages)
    // 发送时立即持久化：流式中途刷新也能从 IndexedDB 恢复这条用户消息
    markModified()
    persist(updatedMessages, currentSystemRoleSettings())
    setStick(true)
    requestWithLatestMessage()
    instantToBottom()
  }

  const clear = async() => {
    const currentMessages = messageList()
    if (currentMessages.length > 0 && isCurrentChatModified())
      await persist(currentMessages, currentSystemRoleSettings())

    cleanupMessageListAttachments(currentMessages)

    inputRef.value = ''
    inputRef.style.height = 'auto'
    setMessageList([])
    resetStreamingBuffers()

    clearAllFiles()

    setStick(false)
    resetCurrentChat()
    // 清掉会话恢复指针，否则刷新后会把刚清空的对话从 IndexedDB 恢复回来
    sessionStorage.removeItem('currentChatHistoryId')
    sessionStorage.removeItem('systemRoleSettings')
  }

  const retryLastFetch = () => {
    // 流式进行中拒绝重试，避免误删正在生成的回复
    if (loading()) return

    if (messageList().length > 0) {
      const lastMessage = messageList()[messageList().length - 1]
      if (lastMessage.role === 'assistant') {
        cleanupMessageAttachments(lastMessage)
        setMessageList(messageList().slice(0, -1))
      }
      setStick(true)
      requestWithLatestMessage()
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey) return
    if (e.key === 'Enter') {
      e.preventDefault()
      handleButtonClick()
    }
  }

  const loadHistory = async(messages: ChatMessage[], systemRole: string, historyId?: string) => {
    await clear()

    // 切换历史会话时关闭动画，避免整屏消息一起淡入
    setEntranceReady(false)
    setMessageList(messages)
    setCurrentSystemRoleSettings(systemRole)

    adoptHistory(historyId)

    setTimeout(() => {
      setEntranceReady(true)
      instantToBottom()
      setStick(true)
    }, CONFIG.LOAD_SCROLL_DELAY)
  }

  const handleFilesSelected = (files: FileAttachment[]) => {
    setPendingAttachments(prev => [...prev, ...files])
  }

  const removeFile = (fileId: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find(file => file.id === fileId)
      if (removed?.url) cleanupFileUrl(removed.url)
      return prev.filter(file => file.id !== fileId)
    })
  }

  const clearAllFiles = () => {
    const files = pendingAttachments()
    files.forEach(file => file.url && cleanupFileUrl(file.url))
    setPendingAttachments([])
  }

  const stickToBottom = () => {
    instantToBottom()
    setStick(true)
  }

  return (
    // 有消息时为底部固定输入框预留空间（含移动端 safe-area），避免输入框遮挡最后一条消息
    <div
      class="my-4"
      classList={{ 'pb-[calc(7.5rem+env(safe-area-inset-bottom))]': messageList().length > 0 }}
    >
      <SystemRoleSettings
        canEdit={() => messageList().length === 0}
        systemRoleEditing={systemRoleEditing}
        setSystemRoleEditing={setSystemRoleEditing}
        currentSystemRoleSettings={currentSystemRoleSettings}
        setCurrentSystemRoleSettings={setCurrentSystemRoleSettings}
      />
      <Index each={messageList()}>
        {(message, index) => (
          <MessageItem
            role={message().role}
            message={() => message().content}
            thinkMessage={() => message().think || ''}
            toolMessage={() => message().toolTrace || ''}
            attachments={message().attachments}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
            onDeleteMessage={() => deleteMessage(index)}
            onEditMessage={newContent => editMessage(index, newContent)}
            animate={entranceReady() && message().role === 'user'}
          />
        )}
      </Index>
      {(currentAssistantMessage() || currentAssistantThinkMessage() || currentAssistantToolMessage()) && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
          thinkMessage={currentAssistantThinkMessage}
          toolMessage={currentAssistantToolMessage}
          animate
          streaming
        />
      )}
      {/* 已发送但还没收到首字：显示"正在输入"动画占位气泡 */}
      {loading() && !currentAssistantMessage() && !currentAssistantThinkMessage() && !currentAssistantToolMessage() && (
        <TypingIndicator />
      )}
      { currentError() && <ErrorMessageItem data={currentError()} onRetry={retryLastFetch} /> }

      {/* 输入区常驻：加载时输入框不消失，仅右下角发送按钮切换为停止 */}
      <div
        class="gen-text-wrapper"
        classList={{
          'fixed bottom-0 left-0 right-0 z-40 bg-[var(--c-bg)] pb-[env(safe-area-inset-bottom)] pt-2 px-4': messageList().length > 0,
          'op-50': systemRoleEditing(),
        }}
      >
        {/* 回到底部：锚定在输入框上方，避免与输入框重叠 */}
        <Show when={messageList().length > 0 && !isStick()}>
          <button
            type="button"
            title="回到底部"
            aria-label="回到底部"
            onClick={stickToBottom}
            class="absolute bottom-full left-1/2 mb-2 z-50 -translate-x-1/2 fcc w-9 h-9 rounded-full border border-slate/20 !bg-[var(--c-bg)] text-base text-[var(--c-fg)] shadow-sm transition-all duration-200 hover:!bg-[color-mix(in_srgb,var(--c-bg)_95%,#64748b)] active:scale-95"
          >
            <IconArrowDown />
          </button>
        </Show>
        <div class="w-full max-w-[95ch] mx-auto">
          <FilePreview
            files={pendingAttachments()}
            onRemoveFile={removeFile}
            onClearAll={clearAllFiles}
          />
          {/* 统一输入容器：textarea 透明嵌入，操作按钮沉到底栏 */}
          <div class="gen-input-box">
            <textarea
              ref={inputRef!}
              disabled={systemRoleEditing()}
              onKeyDown={handleKeydown}
              placeholder="想问一些什么..."
              autocomplete="off"
              autofocus
              onInput={() => {
                inputRef.style.height = 'auto'
                inputRef.style.height = `${inputRef.scrollHeight}px`
              }}
              rows="1"
              class="gen-textarea"
            />
            <div class="fb items-center px-1">
              {/* 左侧工具：附件 + 联网 */}
              <div class="fi gap-1">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  disabled={() => systemRoleEditing()}
                />
                <button
                  type="button"
                  onClick={toggleWebSearch}
                  title={webSearchEnabled() ? '联网搜索：已开启' : '联网搜索：已关闭'}
                  aria-pressed={webSearchEnabled()}
                  disabled={systemRoleEditing() || loading()}
                  class="gen-bar-btn select-none"
                  classList={{ 'text-blue-600 bg-blue-500/10 hover:bg-blue-500/15': webSearchEnabled() }}
                >
                  <IconGlobe />
                  <span class="text-xs">联网</span>
                </button>
              </div>
              {/* 右侧操作：清空 + 导出 + 发送 */}
              <div class="fi gap-1">
                <button title="清空" onClick={clear} disabled={systemRoleEditing() || loading()} class="gen-bar-btn fcc !px-2">
                  <IconClear />
                </button>
                {/* 导出对话：有消息才可用，菜单向上弹出避免被输入框裁切 */}
                <div class="relative inline-fcc" ref={menuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu())}
                    disabled={messageList().length === 0 || systemRoleEditing()}
                    title="导出对话"
                    aria-label="导出对话"
                    class="gen-bar-btn fcc !px-2"
                  >
                    <IconExport />
                  </button>
                  <Show when={showExportMenu()}>
                    <div class="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 min-w-[120px] z-50">
                      <button
                        class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg transition-colors text-sm"
                        onClick={() => handleExport('markdown')}
                      >
                        Markdown
                      </button>
                      <button
                        class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                        onClick={() => handleExport('json')}
                      >
                        JSON
                      </button>
                      <button
                        class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg transition-colors text-sm"
                        onClick={() => handleExport('text')}
                      >
                        纯文本
                      </button>
                    </div>
                  </Show>
                </div>
                <Show
                  when={!loading()}
                  fallback={
                    <button onClick={stopStreamFetch} title="停止生成" aria-label="停止生成" class="gen-send-btn">
                      <IconStop />
                    </button>
                    }
                >
                  <button onClick={handleButtonClick} disabled={systemRoleEditing()} title="发送" aria-label="发送" class="gen-send-btn">
                    <IconArrowUp />
                  </button>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ChatHistory onLoadHistory={loadHistory} />
    </div>
  )
}
