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
            content.push({
              type: 'text',
              text: `\n\n[文件: ${att.name}]\n${att.content}`,
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
          if (!isImageFile(att.type))
            enhancedContent += `\n\n[文件: ${att.name}]\n${att.content}`
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

      const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          try {
            const json = JSON.parse(data)
            const choice = json.choices && json.choices[0]
            const text = choice && choice.delta?.content ? choice.delta.content : ''
            if (text)
              controller.enqueue(new TextEncoder().encode(text))
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
