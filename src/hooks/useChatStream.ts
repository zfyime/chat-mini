import { createSignal } from 'solid-js'
import { generateSignature } from '@/utils/auth'
import { CONFIG } from '@/config/constants'
import { createTagParser } from '@/utils/tagParser'
import type { ChatMessage, ErrorMessage } from '@/types'

interface UseChatStreamOptions {
  messageList: () => ChatMessage[]
  setMessageList: (messages: ChatMessage[]) => void
  systemRole: () => string
  model: () => string
  temperature: () => number
  webSearchEnabled: () => boolean
  onChunk?: () => void
  onArchived?: (messages: ChatMessage[]) => void
}

export const useChatStream = (opts: UseChatStreamOptions) => {
  const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('')
  const [currentAssistantThinkMessage, setCurrentAssistantThinkMessage] = createSignal('')
  const [currentAssistantToolMessage, setCurrentAssistantToolMessage] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [controller, setController] = createSignal<AbortController | null>(null)
  const [currentError, setCurrentError] = createSignal<ErrorMessage>()

  const dispatchStreamingState = (streaming: boolean) => {
    window.dispatchEvent(new CustomEvent('streaming-state-change', { detail: { streaming } }))
  }

  const resetStreamingBuffers = () => {
    setCurrentAssistantMessage('')
    setCurrentAssistantThinkMessage('')
    setCurrentAssistantToolMessage('')
  }

  const thinkParser = createTagParser({
    tags: ['think', 'tool'],
    onText: chunk => setCurrentAssistantMessage(prev => prev + chunk),
    onTag: (tag, chunk) => {
      if (tag === 'think') setCurrentAssistantThinkMessage(prev => prev + chunk)
      else if (tag === 'tool') setCurrentAssistantToolMessage(prev => prev + chunk)
    },
  })

  const archiveCurrentMessage = () => {
    if (!(currentAssistantMessage() || currentAssistantThinkMessage() || currentAssistantToolMessage()))
      return null

    const newAssistantMessage: ChatMessage = {
      role: 'assistant',
      content: currentAssistantMessage(),
      think: currentAssistantThinkMessage(),
      toolTrace: currentAssistantToolMessage() || undefined,
    }
    const updatedMessages = [...opts.messageList(), newAssistantMessage]
    opts.setMessageList(updatedMessages)
    resetStreamingBuffers()
    opts.onArchived?.(updatedMessages)
    return updatedMessages
  }

  const requestWithLatestMessage = async() => {
    setLoading(true)
    resetStreamingBuffers()
    setCurrentError(null)
    thinkParser.reset()
    const storagePassword = localStorage.getItem('pass')
    let aborted = false
    try {
      const ctrl = new AbortController()
      setController(ctrl)
      const requestMessageList = opts.messageList().slice(-CONFIG.CONTEXT_WINDOW_SIZE)
      if (opts.systemRole()) {
        requestMessageList.unshift({
          role: 'system',
          content: opts.systemRole(),
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
          temperature: opts.temperature(),
          model: opts.model(),
          webSearch: opts.webSearchEnabled(),
        }),
        signal: ctrl.signal,
      })
      if (!response.ok) {
        const error = await response.json()
        console.error(error.error)
        setCurrentError(error.error)
        throw new Error('请求失败')
      }
      const data = response.body
      if (!data) throw new Error('没有数据')

      const reader = data.getReader()
      const decoder = new TextDecoder('utf-8')
      let done = false
      let streamingLocked = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        if (value) {
          if (!streamingLocked) {
            dispatchStreamingState(true)
            streamingLocked = true
          }
          const chunk = decoder.decode(value, { stream: true })
          thinkParser.process(chunk)
          opts.onChunk?.()
        }
        done = readerDone
      }
    } catch (e) {
      aborted = (e as Error)?.name === 'AbortError'
      if (!aborted) console.error(e)
    } finally {
      archiveCurrentMessage()
      setLoading(false)
      dispatchStreamingState(false)
      setController(null)
    }
    return { aborted }
  }

  const stopStreamFetch = () => {
    controller()?.abort()
  }

  return {
    currentAssistantMessage,
    currentAssistantThinkMessage,
    currentAssistantToolMessage,
    loading,
    currentError,
    resetStreamingBuffers,
    requestWithLatestMessage,
    stopStreamFetch,
  }
}
