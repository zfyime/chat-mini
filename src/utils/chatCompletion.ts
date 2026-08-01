import { createParser } from 'eventsource-parser'
import { isImageFile } from './fileUtils'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

const transformMessagesForAPI = (messages: ChatMessage[]) => {
  // 只有最后一条用户消息保留附件全文，更早消息的附件替换为占位符，
  // 避免大文件内容随上下文窗口在后续每轮对话中被反复重发
  const lastUserIdx = messages.findLastIndex(m => m.role === 'user')
  // assistant 消息若带 toolContext（上一轮 agent 的 tool_calls + tool 结果），
  // 展开为标准 OpenAI 协议序列放在该消息之前，让后续轮次复用已搜到的内容。
  return messages.flatMap((msg, i) => {
    const single = transformOne(msg, i === lastUserIdx)
    return msg.toolContext?.length ? [...msg.toolContext, single] : single
  })
}

// 历史消息的附件降级为占位符文本，只保留文件名信息
const buildAttachmentPlaceholder = (msg: ChatMessage): string => {
  return msg.attachments!
    .map(att => `[文件: ${att.name}（历史附件，内容已省略）]`)
    .join('\n')
}

const transformOne = (msg: ChatMessage, keepAttachments: boolean) => {
  const baseMessage = {
    role: msg.role,
    content: msg.content,
  }

  // If message has attachments, include them in the content
  if (msg.attachments && msg.attachments.length > 0) {
    if (!keepAttachments) {
      return {
        ...baseMessage,
        content: `${msg.content ?? ''}\n\n${buildAttachmentPlaceholder(msg)}`,
      }
    }

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
    ...(body.stream ? { Accept: 'text/event-stream' } : {}),
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
    // tool_choice 仅在同时带 tools 时才合法，否则上游会报 400（'tool_choice' is only allowed when 'tools' are specified）
    ...(opts.tools && opts.toolChoice ? { tool_choice: opts.toolChoice } : {}),
  })
}

export const parseOpenAIStream = async(rawResponse: Response, opts: PipeOptions = {}) => {
  if (!rawResponse.ok) {
    // 透传上游错误，并把上游真实 HTTP 状态码注入 error 对象，便于前端区分 4xx/5xx。
    // 上游 body 可能是 JSON（{ error: {...} }）也可能是纯文本，做兼容解析。
    const text = await rawResponse.text().catch(() => '')
    let errorBody: any
    try {
      const parsed = JSON.parse(text)
      errorBody = parsed.error ?? parsed
    } catch {
      errorBody = { code: rawResponse.statusText || 'UpstreamError', message: text || '上游返回错误' }
    }
    return new Response(JSON.stringify({
      error: { ...errorBody, status: rawResponse.status },
    }), {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      await pipeOpenAIStreamToController(rawResponse, controller, { closeWhenDone: true, ...opts })
    },
  })

  return new Response(stream)
}

interface PipeOptions {
  // 末轮流式结束时是否关闭 controller。在 agent 聚合流里调多次时应传 false
  closeWhenDone?: boolean
  // 看门狗（毫秒）：超过该时长流仍未正常结束时，主动补 </think>、追加中断提示并关闭流。
  // 防止平台墙钟（如 Vercel maxDuration）直接强杀进程，导致前端拿到无收尾的残流（只有思考没有正文）。
  // 0 或缺省表示禁用。
  timeoutMs?: number
}

// 把一次 OpenAI 流式响应的内容解析后写入给定的 controller。
// 抽出来后既被 parseOpenAIStream 使用，也供 generate.ts 中的 agent 循环复用。
export const pipeOpenAIStreamToController = async(
  rawResponse: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  { closeWhenDone = true, timeoutMs = 0 }: PipeOptions = {},
): Promise<void> => {
  const reader = rawResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
  if (!reader) {
    if (closeWhenDone) controller.close()
    return
  }

  let isThinking = false
  const encoder = new TextEncoder()

  // 幂等收尾：补 think 闭合标签、按需追加提示文本，然后关闭流。
  // [DONE] 帧、上游无 [DONE] 自然断开、看门狗超时三条路径共用，保证前端总能拿到完整的流结束。
  let finalized = false
  const finalize = (notice?: string) => {
    if (finalized) return
    finalized = true
    if (isThinking) {
      controller.enqueue(encoder.encode('</think>'))
      isThinking = false
    }
    if (notice) controller.enqueue(encoder.encode(notice))
    if (closeWhenDone) controller.close()
  }

  // 看门狗：到点先正常收尾，再取消上游读取让下面 while 循环退出
  const watchdog = timeoutMs > 0
    ? setTimeout(() => {
      finalize('\n\n_⚠️ 响应超时中断，请重试_')
      reader.cancel().catch(() => {})
    }, timeoutMs)
    : undefined

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
      // 已收尾（[DONE]/看门狗）后忽略上游迟到的帧，避免向已关闭的流 enqueue
      if (finalized) return
      const data = event.data
      if (data === '[DONE]') {
        finalize()
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
    // 上游无 [DONE] 自然断开（中转网关掐流、网络中断等）：
    // 必须主动收尾，否则前端流永不关闭、think 标签不闭合，消息一直转圈且正文丢失
    finalize()
  } catch (error) {
    if (closeWhenDone) controller.error(error)
    else throw error
  } finally {
    if (watchdog) clearTimeout(watchdog)
  }
}
