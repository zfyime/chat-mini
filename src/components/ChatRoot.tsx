import { Index, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { CONFIG } from '@/config/constants'
import { cleanupFileUrl } from '@/utils/fileUtils'
import { loadChatSession } from '@/utils/currentChatStore'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useChatStream } from '@/hooks/useChatStream'
import { useHistoryPersist } from '@/hooks/useHistoryPersist'
import { useExportMenu } from '@/hooks/useExportMenu'
import IconClear from './icons/Clear'
import IconArrowDown from './icons/ArrowDown'
import IconArrowUp from './icons/ArrowUp'
import IconStop from './icons/Stop'
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
  const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal('')
  const [systemRoleEditing, setSystemRoleEditing] = createSignal(false)
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])
  // 入场动画开关：初始加载/切换历史期间为 false，避免整屏消息一起淡入；加载完成后开启，只有之后的新消息才有动画
  const [entranceReady, setEntranceReady] = createSignal(false)
  const { isStick, setStick, instantToBottom, isAtBottom } = useStickToBottom({
    threshold: CONFIG.SCROLL_THRESHOLD,
  })
  const [temperature, setTemperature] = createSignal(CONFIG.DEFAULT_TEMPERATURE)
  const [chatModel, setChatModel] = createSignal(CONFIG.DEFAULT_MODEL)
  const [webSearchEnabled, setWebSearchEnabled] = createSignal(false)
  const [pendingAttachments, setPendingAttachments] = createSignal<FileAttachment[]>([])

  const {
    isCurrentChatModified,
    persist,
    persistImmediate,
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

  const { showExportMenu, toggleExportMenu, handleExport } = useExportMenu(messageList, currentSystemRoleSettings)

  const temperatureSetting = (value: number) => { setTemperature(value) }
  const chatModelSetting = (value: string) => { setChatModel(value) }

  // 联网搜索开关：状态持久化到 localStorage，编辑系统角色或正在流式输出时禁用
  const toggleWebSearch = () => {
    if (systemRoleEditing() || loading()) return
    const next = !webSearchEnabled()
    setWebSearchEnabled(next)
    localStorage.setItem('web-search-enabled', next ? '1' : '0')
  }

  const cleanupMessageAttachments = (message: ChatMessage) => {
    message.attachments?.forEach(attachment => cleanupFileUrl(attachment.url))
  }

  const cleanupMessageListAttachments = (messages: ChatMessage[]) => {
    messages.forEach(cleanupMessageAttachments)
  }

  onMount(() => {
    const loadSessionData = async() => {
      const session = await loadChatSession()
      if (session.messageList?.length)
        setMessageList(session.messageList)
      if (session.systemRole)
        setCurrentSystemRoleSettings(session.systemRole)
      // 初始消息不做入场动画，加载完成后再开启，使后续新消息才有动画
      setTimeout(() => {
        setStick(isAtBottom())
        setEntranceReady(true)
      })
    }
    loadSessionData()

    const handleModelChange = ((e: CustomEvent) => {
      setChatModel(e.detail)
    }) as EventListener
    window.addEventListener('model-change', handleModelChange)

    // 联网开关已移入输入框底栏，由 toggleWebSearch 直接维护；此处仅恢复上次状态
    const savedWebSearch = localStorage.getItem('web-search-enabled')
    if (savedWebSearch === '1') setWebSearchEnabled(true)

    window.addEventListener('pagehide', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('pagehide', handleBeforeUnload)
      window.removeEventListener('model-change', handleModelChange)
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

    markModified()
    setStick(true)
    requestWithLatestMessage()
    instantToBottom()
  }

  // pagehide 触发时无法 await 异步写盘：会话数据用 sessionStorage 同步落盘；
  // 历史对话已在每次修改后由 saveOrUpdateChat 立即持久化，这里不再重复。
  const handleBeforeUnload = () => {
    try {
      sessionStorage.setItem('messageList', JSON.stringify(messageList()))
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
    const attachments = [...pendingAttachments()]
    setPendingAttachments([])

    const newMessage: ChatMessage = {
      role: 'user',
      content: inputValue || '',
      think: '',
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    setMessageList([...messageList(), newMessage])
    markModified()
    setStick(true)
    requestWithLatestMessage().then((res) => {
      if (!res?.aborted) instantToBottom()
    })
    instantToBottom()
  }

  const clear = async() => {
    const currentMessages = messageList()
    if (currentMessages.length > 0 && isCurrentChatModified())
      await persistImmediate(currentMessages, currentSystemRoleSettings())

    cleanupMessageListAttachments(currentMessages)

    inputRef.value = ''
    inputRef.style.height = 'auto'
    setMessageList([])
    resetStreamingBuffers()

    clearAllFiles()

    setStick(false)
    resetCurrentChat()
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
        temperatureSetting={temperatureSetting}
        chatModelSetting={chatModelSetting}
      />
      <Index each={messageList()}>
        {(message, index) => (
          <MessageItem
            role={message().role}
            message={() => message().content}
            thinkMessage={() => message().think}
            toolMessage={() => message().toolTrace || ''}
            attachments={message().attachments}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
            showExportMenu={showExportMenu}
            onToggleExportMenu={toggleExportMenu}
            onExport={handleExport}
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
            class="absolute bottom-full left-1/2 mb-2 z-50 -translate-x-1/2 fcc gap-1 px-4 py-1.5 rounded-full border border-slate/20 bg-[var(--c-bg)] text-sm text-[var(--c-fg)] shadow-sm transition-all duration-200 hover:bg-slate/5 active:scale-95"
          >
            <span class="fcc text-base leading-none">
              <IconArrowDown />
            </span>
            <span class="font-medium">回到底部</span>
          </button>
        </Show>
        <div class="w-full max-w-[85ch] mx-auto">
          {(() => {
            const files = pendingAttachments()
            return (
              <FilePreview
                files={files}
                onRemoveFile={removeFile}
                onClearAll={clearAllFiles}
              />
            )
          })()}
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
              </div>
              {/* 右侧操作：清空 + 发送 */}
              <div class="fi gap-1">
                <button title="清空" onClick={clear} disabled={systemRoleEditing() || loading()} class="gen-bar-btn fcc !px-2">
                  <IconClear />
                </button>
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
