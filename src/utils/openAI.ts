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
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'text/event-stream',
    'Accept-Charset': 'utf-8',
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
            if (text) {
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