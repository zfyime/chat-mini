import { createParser } from 'eventsource-parser'
import { isImageFile } from './fileUtils'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

const transformMessagesForAPI = (messages: ChatMessage[]) => {
  // assistant 消息若带 toolContext（上一轮 agent 的 tool_calls + tool 结果），
  // 展开为标准 OpenAI 协议序列放在该消息之前，让后续轮次复用已搜到的内容。
  return messages.flatMap((msg) => {
    const single = transformOne(msg)
    return msg.toolContext?.length ? [...msg.toolContext, single] : single
  })
}

const transformOne = (msg: ChatMessage) => {
  const baseMessage = {
    role: msg.role,
    content: msg.content,
  }

  // If message has attachments, include them in the content
  if (msg.attachments && msg.attachments.length > 0) {
    const hasImages = msg.attachments.some(att => isImageFile(att.type))

    if (hasImages && msg.role === 'user') {
      // For GPT-4 Vision API, send content as array with text and images
      const content = []

      // Add text content
      if (msg.content) {
        content.push({
          type: 'text',
          text: msg.content,
        })
      }

      // Add images
      msg.attachments.forEach((att) => {
        if (isImageFile(att.type)) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${att.type};base64,${att.content}`,
            },
          })
        } else {
          // For non-image files, append content as text
          const attachmentHeader = `[文件: ${att.name}]`
          const attachmentBody = att.encoding === 'base64'
            ? `${attachmentHeader} (Base64)\n${att.content}`
            : `${attachmentHeader}\n${att.content}`
          content.push({
            type: 'text',
            text: `\n\n${attachmentBody}`,
          })
        }
      })

      return {
        ...baseMessage,
        content,
      }
    } else {
      // For non-vision models or assistant messages, append file content as text
      let enhancedContent = msg.content ?? ''
      msg.attachments.forEach((att) => {
        if (!isImageFile(att.type)) {
          const attachmentHeader = `[文件: ${att.name}]`
          const attachmentBody = att.encoding === 'base64'
            ? `${attachmentHeader} (Base64)\n${att.content}`
            : `${attachmentHeader}\n${att.content}`
          enhancedContent += `\n\n${attachmentBody}`
        }
      })
      return {
        ...baseMessage,
        content: enhancedContent,
      }
    }
  }

  return baseMessage
}

// 导出供 agent 循环使用：把项目内 ChatMessage 转成 OpenAI 协议格式的消息
export const buildOpenAIMessages = transformMessagesForAPI

interface PayloadOptions {
  stream?: boolean
  tools?: any[]
  toolChoice?: 'auto' | 'none' | 'required'
  // 传 true 表示 messages 已是 OpenAI 协议原始格式（含 tool_calls / role: 'tool' 等），
  // 跳过 transformMessagesForAPI 以免丢字段。Agent 循环里使用。
  pretransformed?: boolean
}

const buildRequestInit = (
  apiKey: string,
  body: Record<string, any>,
): RequestInit & { dispatcher?: any } => ({
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': `Bearer ${apiKey}`,
    // 流式请求才需要 text/event-stream，非流式发该头部分 provider 会行为异常
    ...(body.stream ? { 'Accept': 'text/event-stream' } : {}),
    'Accept-Charset': 'utf-8',
  },
  method: 'POST',
  body: JSON.stringify(body),
})

export const generatePayload = (
  apiKey: string,
  messages: ChatMessage[] | any[],
  temperature: number,
  model: string,
  opts: PayloadOptions = {},
): RequestInit & { dispatcher?: any } => {
  const finalMessages = opts.pretransformed ? messages : transformMessagesForAPI(messages as ChatMessage[])
  return buildRequestInit(apiKey, {
    model,
    messages: finalMessages,
    temperature,
    stream: opts.stream ?? true,
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
  })
}

export const parseOpenAIStream = (rawResponse: Response) => {
  if (!rawResponse.ok) {
    return new Response(rawResponse.body, {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      await pipeOpenAIStreamToController(rawResponse, controller, { closeWhenDone: true })
    },
  })

  return new Response(stream)
}

interface PipeOptions {
  // 末轮流式结束时是否关闭 controller。在 agent 聚合流里调多次时应传 false
  closeWhenDone?: boolean
}

// 把一次 OpenAI 流式响应的内容解析后写入给定的 controller。
// 抽出来后既被 parseOpenAIStream 使用，也供 generate.ts 中的 agent 循环复用。
export const pipeOpenAIStreamToController = async(
  rawResponse: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  { closeWhenDone = true }: PipeOptions = {},
): Promise<void> => {
  const reader = rawResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
  if (!reader) {
    if (closeWhenDone) controller.close()
    return
  }

  let isThinking = false
  const encoder = new TextEncoder()

  const extractTextContent = (content: unknown): string => {
    if (!content) return ''
    if (typeof content === 'string') return content
    if (Array.isArray(content))
      return content.map(item => extractTextContent(item)).join('')

    if (typeof content === 'object') {
      const maybeText = (content as { text?: unknown }).text
      if (typeof maybeText === 'string') return maybeText

      const maybeContent = (content as { content?: unknown }).content
      if (maybeContent !== undefined) return extractTextContent(maybeContent)
    }

    return ''
  }

  const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
    if (event.type === 'event') {
      const data = event.data
      if (data === '[DONE]') {
        if (isThinking)
          controller.enqueue(encoder.encode('</think>'))
        if (closeWhenDone) controller.close()
        return
      }
      try {
        const trimmed = data?.trimStart()
        if (!trimmed || trimmed[0] !== '{')
          return
        const json = JSON.parse(trimmed)
        const choice = json.choices && json.choices[0]

        const rawReasoningContent = choice && choice.delta?.reasoning_content ? choice.delta.reasoning_content : null
        const rawTextContent = choice && choice.delta?.content ? choice.delta.content : null

        const reasoningContent = rawReasoningContent ? extractTextContent(rawReasoningContent) : ''
        const text = rawTextContent ? extractTextContent(rawTextContent) : ''

        if (reasoningContent) {
          if (!isThinking)
            controller.enqueue(encoder.encode('<think>'))

          isThinking = true
          controller.enqueue(encoder.encode(reasoningContent))
        }

        if (text) {
          if (isThinking)
            controller.enqueue(encoder.encode('</think>'))

          isThinking = false
          controller.enqueue(encoder.encode(text))
        }
      } catch (e) {
        // keep-alive / 注释帧
      }
    }
  })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      parser.feed(value)
    }
  } catch (error) {
    if (closeWhenDone) controller.error(error)
    else throw error
  }
}
