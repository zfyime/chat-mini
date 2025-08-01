import { createParser } from 'eventsource-parser'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

export const generatePayload = (
    apiKey: string,
    messages: ChatMessage[],
    temperature: number,
    model: string,
): RequestInit & { dispatcher?: any } => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  method: 'POST',
  body: JSON.stringify({
    model,
    messages,
    temperature,
    stream: true,
  }),
})

export const parseOpenAIStream = (rawResponse: Response) => {
  if (!rawResponse.ok) {
    return new Response(rawResponse.body, {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder('utf-8')
      let buffer = '' // 用于累积不完整的数据
      
      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          
          try {
            const json = JSON.parse(data)
            const text = json.choices?.[0]?.delta?.content || ''
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          } catch (e) {
            console.error('Parse error:', e, 'Data:', data)
          }
        }
      }

      const parser = createParser(streamParser)
      
      try {
        const reader = rawResponse.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        // 逐块读取和处理
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // 处理剩余的 buffer
            if (buffer.trim()) {
              parser.feed(buffer)
            }
            controller.close()
            break
          }

          // 将新的 chunk 添加到 buffer，使用 stream: true 处理跨块的多字节字符
          buffer += decoder.decode(value, { stream: true })
          
          // 按行分割处理完整的 SSE 消息
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留最后一个可能不完整的行
          
          // 处理每一行
          for (const line of lines) {
            parser.feed(line + '\n')
          }
        }
      } catch (error) {
        console.error('Stream processing error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    }
  })
}