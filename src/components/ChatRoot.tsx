import { Index, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { CONFIG } from '@/config/constants'
import { cleanupFileUrl } from '@/utils/fileUtils'
import { loadChatSession } from '@/utils/currentChatStore'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useChatStream } from '@/hooks/useChatStream'
import { useHistoryPersist } from '@/hooks/useHistoryPersist'
import { useExportMenu } from '@/hooks/useExportMenu'
import IconClear from './icons/Clear'
import IconLoading from './icons/Loading'
import IconArrowDown from './icons/ArrowDown'
import MessageItem from './MessageItem'
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
  const { isStick, setStick, instantToBottom } = useStickToBottom({
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
    }
    loadSessionData()

    const handleModelChange = ((e: CustomEvent) => {
      setChatModel(e.detail)
    }) as EventListener
    window.addEventListener('model-change', handleModelChange)

    const savedWebSearch = localStorage.getItem('web-search-enabled')
    if (savedWebSearch === '1') setWebSearchEnabled(true)
    const handleWebSearchChange = ((e: CustomEvent) => {
      setWebSearchEnabled(!!e.detail)
    }) as EventListener
    window.addEventListener('web-search-change', handleWebSearchChange)

    window.addEventListener('pagehide', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('pagehide', handleBeforeUnload)
      window.removeEventListener('model-change', handleModelChange)
      window.removeEventListener('web-search-change', handleWebSearchChange)
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

    setMessageList(messages)
    setCurrentSystemRoleSettings(systemRole)

    adoptHistory(historyId)

    setTimeout(() => {
      instantToBottom()
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
    <div my-4>
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
            message={message().content}
            thinkMessage={message().think}
            toolMessage={message().toolTrace}
            attachments={message().attachments}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
            showExportMenu={showExportMenu}
            onToggleExportMenu={toggleExportMenu}
            onExport={handleExport}
            onDeleteMessage={() => deleteMessage(index)}
            onEditMessage={newContent => editMessage(index, newContent)}
          />
        )}
      </Index>
      {(currentAssistantMessage() || currentAssistantThinkMessage() || currentAssistantToolMessage()) && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
          thinkMessage={currentAssistantThinkMessage}
          toolMessage={currentAssistantToolMessage}
        />
      )}
      { currentError() && <ErrorMessageItem data={currentError()} onRetry={retryLastFetch} /> }
      <Show when={loading() && !isStick()}>
        <button
          type="button"
          title="回到底部"
          aria-label="回到底部"
          onClick={stickToBottom}
          class="fixed left-1/2 z-50 -translate-x-1/2 fcc gap-1 px-4 py-1.5 rounded-full border border-slate/20 bg-[var(--c-bg)] text-sm text-[var(--c-fg)] shadow-sm transition-all duration-200 hover:bg-slate/5 active:scale-95"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
        >
          <span class="fcc text-base leading-none">
            <IconArrowDown />
          </span>
          <span class="font-medium">回到底部</span>
        </button>
      </Show>

      <Show
        when={!loading()}
        fallback={
          <div class="gen-cb-wrapper">
            <IconLoading />
            <span>AI 正在思考中...</span>
            <div class="gen-cb-stop" onClick={stopStreamFetch}>停止</div>
          </div>
        }
      >
        <div
          class="gen-text-wrapper"
          classList={{
            'fixed bottom-0 left-0 right-0 z-40 bg-[var(--c-bg)] pb-[env(safe-area-inset-bottom)] pt-2 px-4': messageList().length > 0,
            'op-50': systemRoleEditing(),
          }}
        >
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
            <div class="fi gap-2 w-full">
              <FileUpload
                onFilesSelected={handleFilesSelected}
                disabled={() => systemRoleEditing()}
              />
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
                class="gen-textarea flex-1 rounded-lg"
              />
              <div class="fi gap-2">
                <button onClick={handleButtonClick} disabled={systemRoleEditing()} class="gen-slate-btn rounded-lg">
                  发送
                </button>
                <button title="清空" onClick={clear} disabled={systemRoleEditing()} class="gen-slate-btn fcc rounded-lg">
                  <IconClear />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
      <ChatHistory onLoadHistory={loadHistory} />
    </div>
  )
}
