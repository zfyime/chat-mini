import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { generateSignature } from '@/utils/auth'
import { CONFIG } from '@/config/constants'
import { saveOrUpdateChat } from '@/store/historyStore'
import { cleanupFileUrl } from '@/utils/fileUtils'
import { exportChat } from '@/utils/exportUtils'
import { chatDB } from '@/utils/indexedDB'
import IconClear from './icons/Clear'
import IconLoading from './icons/Loading'
import IconExport from './icons/Export'
import MessageItem from './MessageItem'
import SystemRoleSettings from './SystemRoleSettings'
import ErrorMessageItem from './ErrorMessageItem'
import ChatHistory from './ChatHistory'
import FileUpload from './FileUpload'
import FilePreview from './FilePreview'
import type { ChatMessage, ErrorMessage, FileAttachment } from '@/types'

export default () => {
  let inputRef: HTMLTextAreaElement
  const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal('')
  const [systemRoleEditing, setSystemRoleEditing] = createSignal(false)
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])
  const [currentError, setCurrentError] = createSignal<ErrorMessage>()
  const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('')
  const [currentAssistantThinkMessage, setCurrentAssistantThinkMessage] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [controller, setController] = createSignal<AbortController>(null)
  const [isStick, setStick] = createSignal(false) // 默认关闭
  const [temperature, setTemperature] = createSignal(CONFIG.DEFAULT_TEMPERATURE)
  const [chatModel, setChatModel] = createSignal(CONFIG.DEFAULT_MODEL)
  // 新增：跟踪对话状态
  const [isCurrentChatModified, setIsCurrentChatModified] = createSignal(false)
  const [currentChatHistoryId, setCurrentChatHistoryId] = createSignal<string>()
  // 新增：文件上传状态
  const [pendingAttachments, setPendingAttachments] = createSignal<FileAttachment[]>([])
  // 新增：导出菜单状态
  const [showExportMenu, setShowExportMenu] = createSignal(false)
  const temperatureSetting = (value: number) => { setTemperature(value) }
  const chatModelSetting = (value: string) => { setChatModel(value) }
  const maxHistoryMessages = CONFIG.MAX_HISTORY_MESSAGES

  // 检查是否已经在底部的函数
  const isAtBottom = () => {
    const threshold = CONFIG.SCROLL_THRESHOLD // 允许的误差 px
    return window.innerHeight + window.scrollY >= document.body.scrollHeight - threshold
  }

  createEffect(() => (isStick() && smoothToBottom()))

  onMount(() => {
    let lastPosition = window.scrollY
    let userScrolling = false

    const handleScroll = () => {
      const nowPosition = window.scrollY

      // 用户向上滚动
      if (nowPosition < lastPosition) {
        userScrolling = true
        setStick(false)
      } else if (userScrolling && isAtBottom()) {
        // 用户向下滚动到底部
        userScrolling = false
        setStick(true)
      }

      lastPosition = nowPosition
    }

    window.addEventListener('scroll', handleScroll)

    // 点击外部关闭导出菜单
    const handleClickOutside = (e: MouseEvent) => {
      // 检查点击是否在导出按钮或菜单内
      const target = e.target as HTMLElement
      if (!target.closest('[title="导出对话"]') && !target.closest('.export-menu')) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)

    // 使用 IndexedDB 替代 sessionStorage
    const loadSessionData = async () => {
      try {
        if (chatDB.isSupported()) {
          await chatDB.init()
          const savedMessages = await chatDB.getSession('messageList')
          if (savedMessages) {
            setMessageList(savedMessages)
          }
          const savedSystemRole = await chatDB.getSession('systemRoleSettings')
          if (savedSystemRole) {
            setCurrentSystemRoleSettings(savedSystemRole)
          }
        } else {
          // 降级到 sessionStorage
          if (sessionStorage.getItem('messageList'))
            setMessageList(JSON.parse(sessionStorage.getItem('messageList')))

          if (sessionStorage.getItem('systemRoleSettings'))
            setCurrentSystemRoleSettings(sessionStorage.getItem('systemRoleSettings'))
        }
      } catch (err) {
        console.error('Failed to load session data:', err)
        // 降级到 sessionStorage
        try {
          if (sessionStorage.getItem('messageList'))
            setMessageList(JSON.parse(sessionStorage.getItem('messageList')))

          if (sessionStorage.getItem('systemRoleSettings'))
            setCurrentSystemRoleSettings(sessionStorage.getItem('systemRoleSettings'))
        } catch (e) {
          console.error('Fallback to sessionStorage also failed:', e)
        }
      }
    }

    loadSessionData()

    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClickOutside)
      // 清理文件URL
      pendingAttachments().forEach(file => cleanupFileUrl(file.url))
    })
  })

  // 删除单条消息
  const deleteMessage = (index: number) => {
    const updatedMessages = messageList().filter((_, i) => i !== index)
    setMessageList(updatedMessages)

    // 标记对话已修改并保存
    setIsCurrentChatModified(true)
    if (updatedMessages.length > 0) {
      saveOrUpdateChat(updatedMessages, currentSystemRoleSettings(), currentChatHistoryId()).then(historyId => {
        if (historyId) setCurrentChatHistoryId(historyId)
      })
    }
  }

  // 复制消息（可选，用于日志记录等）
  const copyMessage = (_content: string) => {
    // 这里可以添加复制相关的逻辑，如统计等
    // console.log('Message copied:', content.slice(0, 50) + '...')
  }

  const handleBeforeUnload = async () => {
    // 如果有未保存的对话修改，自动保存
    if (messageList().length > 0 && isCurrentChatModified())
      await saveOrUpdateChat(messageList(), currentSystemRoleSettings(), currentChatHistoryId())

    // 保存到 IndexedDB
    try {
      if (chatDB.isSupported()) {
        await chatDB.saveSession('messageList', messageList())
        await chatDB.saveSession('systemRoleSettings', currentSystemRoleSettings())
      } else {
        // 降级到 sessionStorage
        sessionStorage.setItem('messageList', JSON.stringify(messageList()))
        sessionStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
      }
    } catch (e) {
      console.error('Failed to save session:', e)
      // 降级到 sessionStorage
      try {
        sessionStorage.setItem('messageList', JSON.stringify(messageList()))
        sessionStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
      } catch (fallbackError) {
        console.error('Fallback to sessionStorage also failed:', fallbackError)
      }
    }
  }

  const handleButtonClick = async() => {
    const inputValue = inputRef.value
    if (!inputValue && pendingAttachments().length === 0)
      return

    inputRef.value = ''
    const attachments = [...pendingAttachments()]
    setPendingAttachments([]) // Clear pending attachments

    const newMessage: ChatMessage = {
      role: 'user',
      content: inputValue || '', // Allow empty content if there are attachments
      think: '',
      attachments: attachments.length > 0 ? attachments : undefined,
    }

    setMessageList([
      ...messageList(),
      newMessage,
    ])

    // 标记对话已修改
    setIsCurrentChatModified(true)

    // 用户发送消息时自动开启自动滚动
    setStick(true)
    requestWithLatestMessage()
    instantToBottom()
  }

  const smoothToBottom = useThrottleFn(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, CONFIG.SMOOTH_SCROLL_DELAY, false, true)

  const instantToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  }

  const requestWithLatestMessage = async() => {
    setLoading(true)
    setCurrentAssistantMessage('')
    setCurrentAssistantThinkMessage('')
    setCurrentError(null)
    const storagePassword = localStorage.getItem('pass')
    try {
      const controller = new AbortController()
      setController(controller)
      const requestMessageList = messageList().slice(-maxHistoryMessages)
      if (currentSystemRoleSettings()) {
        requestMessageList.unshift({
          role: 'system',
          content: currentSystemRoleSettings(),
        })
      }
      const timestamp = Date.now()
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          messages: requestMessageList,
          time: timestamp,
          pass: storagePassword,
          sign: await generateSignature({
            t: timestamp,
            m: requestMessageList?.[requestMessageList.length - 1]?.content || '',
          }),
          temperature: temperature(),
          model: chatModel(),
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const error = await response.json()
        console.error(error.error)
        setCurrentError(error.error)
        throw new Error('请求失败')
      }
      const data = response.body
      if (!data)
        throw new Error('没有数据')

      const reader = data.getReader()
      const decoder = new TextDecoder('utf-8')
      let done = false
      let buffer = ''
      let inThinkTag = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        if (value) {
          buffer += decoder.decode(value, { stream: true })

          // Process buffer for think tags
          while (true) {
            if (inThinkTag) {
              const endTagIndex = buffer.indexOf('</think>')
              if (endTagIndex !== -1) {
                const thinkContent = buffer.substring(0, endTagIndex)
                setCurrentAssistantThinkMessage(currentAssistantThinkMessage() + thinkContent)
                buffer = buffer.substring(endTagIndex + 8) // 8 is length of '</think>'
                inThinkTag = false
              } else {
                // Incomplete think tag, wait for more data
                setCurrentAssistantThinkMessage(currentAssistantThinkMessage() + buffer)
                buffer = ''
                break
              }
            } else {
              const startTagIndex = buffer.indexOf('<think>')
              if (startTagIndex !== -1) {
                const regularContent = buffer.substring(0, startTagIndex)
                setCurrentAssistantMessage(currentAssistantMessage() + regularContent)
                buffer = buffer.substring(startTagIndex + 7) // 7 is length of '<think>'
                inThinkTag = true
              } else {
                // No think tag found, treat all as regular content
                setCurrentAssistantMessage(currentAssistantMessage() + buffer)
                buffer = ''
                break
              }
            }
          }

          isStick() && instantToBottom()
        }
        done = readerDone
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
      setController(null)
      return
    }
    archiveCurrentMessage()
    instantToBottom()
  }

  const archiveCurrentMessage = () => {
    if (currentAssistantMessage() || currentAssistantThinkMessage()) {
      const newAssistantMessage: ChatMessage = {
        role: 'assistant',
        content: currentAssistantMessage(),
        think: currentAssistantThinkMessage(),
      }

      const updatedMessages = [
        ...messageList(),
        newAssistantMessage,
      ]

      setMessageList(updatedMessages)
      setCurrentAssistantMessage('')
      setCurrentAssistantThinkMessage('')
      setLoading(false)
      setController(null)

      // 标记对话已修改并立即保存/更新历史
      setIsCurrentChatModified(true)

      // 立即保存或更新历史记录
      saveOrUpdateChat(updatedMessages, currentSystemRoleSettings(), currentChatHistoryId()).then(historyId => {
        if (historyId)
          setCurrentChatHistoryId(historyId)
      })

      // Disable auto-focus on touch devices
      if (!('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0))
        inputRef.focus()
    }
  }

  const clear = async () => {
    // 只有当对话被修改且不是历史对话时才保存
    if (messageList().length > 0 && isCurrentChatModified())
      await saveOrUpdateChat(messageList(), currentSystemRoleSettings(), currentChatHistoryId())

    inputRef.value = ''
    inputRef.style.height = 'auto'
    setMessageList([])
    setCurrentAssistantMessage('')
    setCurrentAssistantThinkMessage('')
    setCurrentError(null)

    // 清除文件
    clearAllFiles()

    // 清空后关闭自动滚动
    setStick(false)
    // 重置对话状态
    setIsCurrentChatModified(false)
    setCurrentChatHistoryId()
  }

  const stopStreamFetch = () => {
    if (controller()) {
      controller().abort()
      archiveCurrentMessage()
    }
  }

  const retryLastFetch = () => {
    if (messageList().length > 0) {
      const lastMessage = messageList()[messageList().length - 1]
      if (lastMessage.role === 'assistant')
        setMessageList(messageList().slice(0, -1))
      // 重试时开启自动滚动
      setStick(true)
      requestWithLatestMessage()
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey)
      return

    if (e.key === 'Enter') {
      e.preventDefault()
      handleButtonClick()
    }
  }

  // 加载历史对话
  const loadHistory = (messages: ChatMessage[], systemRole: string, historyId?: string) => {
    clear()

    setMessageList(messages)
    setCurrentSystemRoleSettings(systemRole)

    // 设置当前加载的历史对话状态
    setCurrentChatHistoryId(historyId)
    setIsCurrentChatModified(false) // 刚加载的历史对话未修改

    // 滚动到底部
    setTimeout(() => {
      instantToBottom()
    }, 100)
  }

  // 处理导出
  const handleExport = (format: 'markdown' | 'json' | 'text') => {
    try {
      if (messageList().length === 0) {
        return
      }

      const result = exportChat(messageList(), currentSystemRoleSettings(), format)
      setShowExportMenu(false)
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  // 处理文件上传
  const handleFilesSelected = (files: FileAttachment[]) => {
    setPendingAttachments(prev => [...prev, ...files])
  }

  // 移除单个文件
  const removeFile = (fileId: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find(file => file.id === fileId)
      if (removed?.url) cleanupFileUrl(removed.url)
      return prev.filter(file => file.id !== fileId)
    })
  }

  // 清除所有文件
  const clearAllFiles = () => {
    const files = pendingAttachments()
    files.forEach(file => file.url && cleanupFileUrl(file.url))
    setPendingAttachments([])
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
            attachments={message().attachments}
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
            onCopyMessage={copyMessage}
            onDeleteMessage={() => deleteMessage(index)}
          />
        )}
      </Index>
      {(currentAssistantMessage() || currentAssistantThinkMessage()) && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
          thinkMessage={currentAssistantThinkMessage}
        />
      )}
      { currentError() && <ErrorMessageItem data={currentError()} onRetry={retryLastFetch} /> }

      {/* File preview section - always shown when files are selected */}
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
        <div class="gen-text-wrapper" class:op-50={systemRoleEditing()}>
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
      </Show>
      <ChatHistory onLoadHistory={loadHistory} />

      {/* 导出按钮 */}
      <Show when={messageList().length > 0}>
        <div class="fixed bottom-5 left-14 sm:left-16 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90 z-50">
          <div class="relative">
            <button
              class="p-2.5 text-base"
              title="导出对话"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowExportMenu(!showExportMenu())
              }}
            >
              <IconExport />
            </button>

            {/* 导出菜单 */}
            <Show when={showExportMenu()}>
              <div
                class="export-menu absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 min-w-[120px] z-50"
                onClick={e => e.stopPropagation()}
              >
                <button
                  class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg transition-colors text-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExport('markdown')
                  }}
                >
                  Markdown
                </button>
                <button
                  class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExport('json')
                  }}
                >
                  JSON
                </button>
                <button
                  class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg transition-colors text-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExport('text')
                  }}
                >
                  纯文本
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
