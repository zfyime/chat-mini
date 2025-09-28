import { createParser } from 'eventsource-parser'
import { isImageFile } from './fileUtils'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

const transformMessagesForAPI = (messages: ChatMessage[]) => {
  return messages.map((msg) => {
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
        let enhancedContent = msg.content
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
  })
}

export const generatePayload = (
  apiKey: string,
  messages: ChatMessage[],
  temperature: number,
  model: string,
): RequestInit & { dispatcher?: any } => {
  const transformedMessages = transformMessagesForAPI(messages)

  return {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
      'Accept-Charset': 'utf-8',
    },
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: transformedMessages,
      temperature,
      stream: true,
    }),
  }
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
      const reader = rawResponse.body?.pipeThrough(new TextDecoderStream()).getReader()
      if (!reader) return

      let isInReasoningMode = false
      let hasStartedThinkTag = false

      // 辅助函数：提取文本内容
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
            // 如果还在思考模式中，需要关闭 think 标签
            if (isInReasoningMode && hasStartedThinkTag) {
              controller.enqueue(new TextEncoder().encode('</think>'))
            }
            controller.close()
            return
          }
          try {
            const json = JSON.parse(data)
            const choice = json.choices && json.choices[0]

            // 处理 reasoning_content 字段（与 delta 同级）
            const rawReasoningContent = choice && choice.delta?.reasoning_content ? choice.delta.reasoning_content : null
            const rawTextContent = choice && choice.delta?.content ? choice.delta.content : null

            // 提取实际的文本内容
            const reasoningContent = rawReasoningContent ? extractTextContent(rawReasoningContent) : ''
            const text = rawTextContent ? extractTextContent(rawTextContent) : ''

            // 处理流式的 reasoning_content
            if (reasoningContent) {
              // 如果是第一次遇到 reasoning_content，发送 <think> 开始标签
              if (!isInReasoningMode) {
                isInReasoningMode = true
                hasStartedThinkTag = true
                controller.enqueue(new TextEncoder().encode('<think>'))
              }
              // 发送思考内容
              controller.enqueue(new TextEncoder().encode(reasoningContent))
            }

            // 如果有正常内容，且之前在思考模式，先关闭 think 标签
            if (text) {
              if (isInReasoningMode && hasStartedThinkTag) {
                controller.enqueue(new TextEncoder().encode('</think>'))
                isInReasoningMode = false
                hasStartedThinkTag = false
              }
              // 发送正常的内容
              controller.enqueue(new TextEncoder().encode(text))
            }
          } catch (e) {
            controller.error(e)
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
        controller.error(error)
      }
    },
  })

  return new Response(stream)
}
