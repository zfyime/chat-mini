import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { generateSignature } from '@/utils/auth'
import IconClear from './icons/Clear'
import MessageItem from './MessageItem'
import SystemRoleSettings from './SystemRoleSettings'
import ErrorMessageItem from './ErrorMessageItem'
import ChatHistory from './ChatHistory'
import type { ChatMessage, ErrorMessage } from '@/types'

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
  const [temperature, setTemperature] = createSignal(0.6)
  const [chatModel, setChatModel] = createSignal('gpt-4.1')
  const temperatureSetting = (value: number) => { setTemperature(value) }
  const chatModelSetting = (value: string) => { setChatModel(value) }
  const maxHistoryMessages = parseInt('6')

  // 检查是否已经在底部的函数
  const isAtBottom = () => {
    const threshold = 25 // 允许的误差 px
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
      } 
      // 用户向下滚动到底部
      else if (userScrolling && isAtBottom()) {
        userScrolling = false
        setStick(true)
      }
      
      lastPosition = nowPosition
    }

    window.addEventListener('scroll', handleScroll)

    try {
      if (sessionStorage.getItem('messageList'))
        setMessageList(JSON.parse(sessionStorage.getItem('messageList')))

      if (sessionStorage.getItem('systemRoleSettings'))
        setCurrentSystemRoleSettings(sessionStorage.getItem('systemRoleSettings'))

      // 不需要恢复 stickToBottom 状态，始终从默认状态开始
    } catch (err) {
      console.error(err)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    onCleanup(() => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })

  const handleBeforeUnload = () => {
    sessionStorage.setItem('messageList', JSON.stringify(messageList()))
    sessionStorage.setItem('systemRoleSettings', currentSystemRoleSettings())
    // 不需要保存 stickToBottom 状态
  }

  const handleButtonClick = async() => {
    const inputValue = inputRef.value
    if (!inputValue)
      return

    inputRef.value = ''
    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
        think: '',
      },
    ])
    
    // 用户发送消息时自动开启自动滚动
    setStick(true)
    requestWithLatestMessage()
    instantToBottom()
  }

  const smoothToBottom = useThrottleFn(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, 300, false, true)

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
        throw new Error('Request failed')
      }
      const data = response.body
      if (!data)
        throw new Error('No data')

      const reader = data.getReader()
      const decoder = new TextDecoder('utf-8')
      let done = false
      let think = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        if (value) {
          let char = decoder.decode(value)

          if (char.indexOf("<think>") != -1 || char.indexOf("</think>") != -1 || think) {
            if (char === '\n' && currentAssistantThinkMessage().endsWith('\n')) 
              continue
            if (char.indexOf("<think>") != -1) {
              char = char.replace("<think>", "");
              think = true
            }
            if (char.indexOf("<\/think>") != -1) {
              think = false
              const [before, after] = char.split('<\/think>');
              char = before
              setCurrentAssistantMessage(currentAssistantMessage() + after)
            }
            if (char)
              setCurrentAssistantThinkMessage(currentAssistantThinkMessage() + char)
            isStick() && instantToBottom()
            continue
          }
          
          if (char === '\n' && currentAssistantMessage().endsWith('\n'))
            continue
          if (char)
            setCurrentAssistantMessage(currentAssistantMessage() + char)
          
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
    if (currentAssistantMessage()) {
      setMessageList([
        ...messageList(),
        {
          role: 'assistant',
          content: currentAssistantMessage(),
          think: currentAssistantThinkMessage(),
        },
      ])
      setCurrentAssistantMessage('')
      setCurrentAssistantThinkMessage('')
      setLoading(false)
      setController(null)
      // Disable auto-focus on touch devices
      if (!('ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0))
        inputRef.focus()
    }
  }

  const clear = () => {
    // 如果有对话内容，保存到历史记录
    if (messageList().length > 0) {
      const saveFunc = (window as any).saveCurrentChatHistory
      if (saveFunc) {
        saveFunc(messageList(), currentSystemRoleSettings())
      }
    }
    
    inputRef.value = ''
    inputRef.style.height = 'auto'
    setMessageList([])
    setCurrentAssistantMessage('')
    setCurrentAssistantThinkMessage('')
    setCurrentError(null)
    // 清空后关闭自动滚动
    setStick(false)
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

  // 手动切换粘性滚动状态
  const toggleStick = () => {
    const newStickState = !isStick()
    setStick(newStickState)
    if (newStickState) {
      instantToBottom()
    }
  }

  // 加载历史对话
  const loadHistory = (messages: ChatMessage[], systemRole: string) => {
    // 如果当前有对话内容，先保存到历史记录
    if (messageList().length > 0) {
      const saveFunc = (window as any).saveCurrentChatHistory
      if (saveFunc) {
        saveFunc(messageList(), currentSystemRoleSettings())
      }
    }
    
    setMessageList(messages)
    setCurrentSystemRoleSettings(systemRole)
    setCurrentAssistantMessage('')
    setCurrentAssistantThinkMessage('')
    setCurrentError(null)
    setStick(false)
    
    // 清除input内容
    if (inputRef) {
      inputRef.value = ''
      inputRef.style.height = 'auto'
    }
    
    // 滚动到底部
    setTimeout(() => {
      instantToBottom()
    }, 100)
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
            showRetry={() => (message().role === 'assistant' && index === messageList().length - 1)}
            onRetry={retryLastFetch}
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
      <Show
        when={!loading()}
        fallback={() => (
          <div class="gen-cb-wrapper">
            <span>AI is thinking...</span>
            <div class="gen-cb-stop" onClick={stopStreamFetch}>Stop</div>
          </div>
        )}
      >
        <div class="gen-text-wrapper" class:op-50={systemRoleEditing()}>
          <textarea
            ref={inputRef!}
            disabled={systemRoleEditing()}
            onKeyDown={handleKeydown}
            placeholder="Enter something..."
            autocomplete="off"
            autofocus
            onInput={() => {
              inputRef.style.height = 'auto'
              inputRef.style.height = `${inputRef.scrollHeight}px`
            }}
            rows="1"
            class="gen-textarea"
          />
          <button onClick={handleButtonClick} disabled={systemRoleEditing()} gen-slate-btn>
            Send
          </button>
          <button title="Clear" onClick={clear} disabled={systemRoleEditing()} gen-slate-btn>
            <IconClear />
          </button>
        </div>
      </Show>
      <ChatHistory onLoadHistory={loadHistory} />
      
      <div class="fixed bottom-5 left-5 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90" class:stick-btn-on={isStick()}>
        <div>
          <button class="p-2.5 text-base" title="stick to bottom" type="button" onClick={toggleStick}>
            <div i-ph-arrow-line-down-bold />
          </button>
        </div>
      </div>
    </div>
  )
}