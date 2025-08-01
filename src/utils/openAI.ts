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
            const text = json.choices?.[0]?.delta?.content || ''
            
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          } catch (e) {
            console.error('Parse error:', e)
          }
        }
      }

      const parser = createParser(streamParser)
      
      // 使用 Response.text() 确保正确的 UTF-8 处理
      const text = await rawResponse.text()
      parser.feed(text)
    },
  })

  return new Response(stream)
}

