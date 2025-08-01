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
      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          
          try {
            const json = JSON.parse(data)
            const text = json.choices?.[0]?.delta?.content
            
            // 更严格的检查：只有当 text 存在且不为 undefined/null 时才处理
            if (text !== undefined && text !== null) {
              // 即使是空字符串也可能有意义（比如删除字符的操作）
              controller.enqueue(encoder.encode(text))
            }
          } catch (e) {
            console.error('Parse error:', e)
          }
        }
      }

      const parser = createParser(streamParser)
      const decoder = new TextDecoder()
      
      if (!rawResponse.body) {
        controller.close()
        return
      }

      const reader = rawResponse.body.getReader()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          parser.feed(chunk)
        }
        
        const finalChunk = decoder.decode()
        if (finalChunk) {
          parser.feed(finalChunk)
        }
        
        controller.close()
      } catch (error) {
        console.error('Stream error:', error)
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
  })

  return new Response(stream)
}
