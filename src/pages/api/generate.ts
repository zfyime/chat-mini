// #vercel-disable-blocks
import { ProxyAgent, fetch } from 'undici'
// #vercel-end
import { buildOpenAIMessages, generatePayload, parseOpenAIStream, pipeOpenAIStreamToController } from '@/utils/chatCompletion'
import { verifySignature } from '@/utils/auth'
import { tavilySearch } from '@/utils/tavily'
import { AGENT, AVAILABLE_MODELS, CONFIG } from '@/config/constants'
import { AGENT_TOOLS } from '@/config/tools'
import type { APIRoute } from 'astro'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const tavilyApiKey = import.meta.env.TAVILY_API_KEY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com/v1').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD || ''
const passList = sitePassword.split(',') || []
const allowedModels = AVAILABLE_MODELS.map(m => m.id)
const apiModel = CONFIG.DEFAULT_MODEL

export const post: APIRoute = async(context) => {
  const body = await context.request.json()
  const { sign, time, messages, pass, temperature, model, webSearch } = body
  if (!messages) {
    return new Response(JSON.stringify({
      error: {
        message: 'No input text.',
      },
    }), { status: 400 })
  }
  if (sitePassword && !(sitePassword === pass || passList.includes(pass))) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }

  const modelToUse = model || apiModel

  if (!allowedModels.includes(modelToUse)) {
    return new Response(JSON.stringify({
      error: {
        message: `Model ${modelToUse} is not allowed.`,
      },
    }), { status: 400 })
  }

  const dispatcher = httpsProxy ? new ProxyAgent(httpsProxy) : undefined

  // 联网搜索开关关闭：走原有的单次流式逻辑
  if (!webSearch) {
    const initOptions = generatePayload(apiKey, messages, temperature, modelToUse)
    // #vercel-disable-blocks
    if (dispatcher) initOptions.dispatcher = dispatcher
    // #vercel-end

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const response = await fetch(`${baseUrl}/chat/completions`, initOptions).catch((err: Error) => {
      console.error(err)
      return new Response(JSON.stringify({
        error: {
          code: err.name,
          message: err.message,
        },
      }), { status: 500 })
    }) as Response

    return parseOpenAIStream(response) as Response
  }

  // 联网开但未配置 Tavily key
  if (!tavilyApiKey) {
    return new Response(JSON.stringify({
      error: {
        message: '未配置 TAVILY_API_KEY，无法使用联网搜索。',
      },
    }), { status: 400 })
  }

  return runAgentLoop({
    messages,
    temperature,
    model: modelToUse,
    dispatcher,
  })
}

interface AgentLoopArgs {
  messages: any[]
  temperature: number
  model: string
  dispatcher?: any
}

const mergeToolCallDelta = (toolCalls: any[], deltaToolCalls: any[]) => {
  deltaToolCalls.forEach((deltaCall) => {
    const index = deltaCall.index ?? toolCalls.length
    const current = toolCalls[index] || { function: {} }
    const currentFunction = current.function || {}
    const deltaFunction = deltaCall.function || {}
    const functionName = typeof deltaFunction.name === 'string' && deltaFunction.name.trim()
      ? deltaFunction.name
      : currentFunction.name
    const functionArguments = deltaFunction.arguments === undefined
      ? currentFunction.arguments || ''
      : `${currentFunction.arguments || ''}${typeof deltaFunction.arguments === 'string' ? deltaFunction.arguments : JSON.stringify(deltaFunction.arguments)}`

    // 部分 OpenAI 兼容上游会在后续分片里发空 name/id/type，不能覆盖首个有效分片。
    toolCalls[index] = {
      ...current,
      ...deltaCall,
      id: deltaCall.id || current.id,
      type: deltaCall.type || current.type,
      function: {
        ...currentFunction,
        ...deltaFunction,
        name: functionName,
        arguments: functionArguments,
      },
    }
  })
}

const normalizeToolCalls = (toolCalls: any[], round: number) => {
  return toolCalls
    .map((call, index) => {
      const name = call?.function?.name?.trim()
      if (!name) return null

      return {
        ...call,
        id: call.id || `call_${round}_${index}`,
        type: call.type || 'function',
        function: {
          ...call.function,
          name,
          arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : '{}',
        },
      }
    })
    .filter(Boolean)
}

const parseAgentProbeResponse = (rawText: string) => {
  if (!rawText.split('\n').some(line => line.startsWith('data: ')))
    return JSON.parse(rawText)

  const message: any = { role: 'assistant', content: '' }
  const toolCalls: any[] = []
  let reasoningContent = ''

  rawText.split('\n').forEach((line) => {
    if (!line.startsWith('data: ')) return
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') return

    const json = JSON.parse(data)
    const choice = json.choices?.[0]
    const completeMessage = choice?.message
    if (completeMessage) {
      Object.assign(message, completeMessage)
      return
    }

    const delta = choice?.delta
    if (!delta) return
    if (delta.role) message.role = delta.role
    if (delta.content) message.content += delta.content
    if (delta.reasoning_content) reasoningContent += delta.reasoning_content
    if (delta.tool_calls) mergeToolCallDelta(toolCalls, delta.tool_calls)
  })

  if (toolCalls.length) message.tool_calls = toolCalls
  if (reasoningContent) message.reasoning_content = reasoningContent

  return { choices: [{ message }] }
}

const runAgentLoop = ({ messages, temperature, model, dispatcher }: AgentLoopArgs): Response => {
  const encoder = new TextEncoder()
  // 把项目内的 ChatMessage 转成 OpenAI 协议消息后作为初始 workingMessages
  const workingMessages: any[] = buildOpenAIMessages(messages)
  // 记录初始长度：之后 push 进来的全是 agent 中间消息（assistant tool_calls + role:'tool' 结果），
  // workingMessages.slice(initialLen) 即本轮需回灌给客户端持久化的协议片段。
  const initialLen = workingMessages.length

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeToolTag = (body: string) => {
        controller.enqueue(encoder.encode(`<tool>${body}\n</tool>`))
      }

      // 把本轮 agent 中间协议消息以 <tool_data> 标签透传给客户端（非展示，纯数据），
      // 供下一轮请求展开回灌，让模型复用已搜到的内容。无中间消息时不发。
      const flushToolContext = () => {
        const toolContext = workingMessages.slice(initialLen)
        if (toolContext.length) {
          // 转义 '<' 为 <（合法 JSON），确保搜索内容里的尖括号不会产生伪 </tool_data> 闭合标签
          const json = JSON.stringify(toolContext).replace(/</g, '\\u003c')
          controller.enqueue(encoder.encode(`<tool_data>${json}</tool_data>`))
        }
      }

      try {
        let round = 0
        while (round < AGENT.MAX_TOOL_ROUNDS) {
          // 用流式 + tools 探测模型是否要调工具。
          // 必须用流式：非流式请求会挂着连接零字节返回直到补全完成，带 tools 探测耗时长，
          // 易触发上游 nginx 的 proxy_read_timeout 导致 504。流式首字节快、字节持续流动可避免。
          // 响应仍整体读取后由 parseAgentProbeResponse 合并 SSE delta 还原为等价的非流式 message。
          const init = generatePayload(apiKey, workingMessages, temperature, model, {
            stream: true,
            tools: AGENT_TOOLS as any[],
            toolChoice: 'auto',
            pretransformed: true,
          })
          if (dispatcher) (init as any).dispatcher = dispatcher

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          const resp = await fetch(`${baseUrl}/chat/completions`, init) as Response
          if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            controller.enqueue(encoder.encode(`\n\n[上游错误 ${resp.status}] ${text.slice(0, 300)}`))
            controller.close()
            return
          }
          const rawText = await resp.text()
          // 整体读取流式 SSE 后合并 delta，还原为等价的非流式 message。
          const json: any = parseAgentProbeResponse(rawText)
          const choice = json.choices?.[0]
          const msg = choice?.message

          if (!msg) {
            controller.enqueue(encoder.encode('\n\n[上游返回为空]'))
            controller.close()
            return
          }

          // 模型不再调用工具：先flush搜索上下文，再用流式重新请求以获得逐字输出
          const toolCalls = msg.tool_calls ? normalizeToolCalls(msg.tool_calls, round) : []

          if (toolCalls.length === 0) {
            flushToolContext()
            const streamInit = generatePayload(apiKey, workingMessages, temperature, model, {
              stream: true,
              // 必须继续带上 tools：此时 workingMessages 含 tool_calls / role:'tool' 历史，
              // 部分上游在缺失 tools schema 时会拒绝校验该历史而报 400。tool_choice:'none' 保证不再触发调用。
              tools: AGENT_TOOLS as any[],
              toolChoice: 'none',
              pretransformed: true,
            })
            if (dispatcher) (streamInit as any).dispatcher = dispatcher
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            const streamResp = await fetch(`${baseUrl}/chat/completions`, streamInit) as Response
            if (!streamResp.ok) {
              const text = await streamResp.text().catch(() => '')
              controller.enqueue(encoder.encode(`\n\n[上游错误 ${streamResp.status}] ${text.slice(0, 300)}`))
              controller.close()
              return
            }
            await pipeOpenAIStreamToController(streamResp, controller, { closeWhenDone: true })
            return
          }

          // 把 assistant 这条带 tool_calls 的消息回灌到上下文
          workingMessages.push({
            role: 'assistant',
            content: msg.content ?? '',
            tool_calls: toolCalls,
          })

          for (const call of toolCalls) {
            if (call?.function?.name !== 'web_search') {
              writeToolTag(`⚠️ 未知工具: ${call?.function?.name}`)
              workingMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: 'unknown tool' }),
              })
              continue
            }

            let args: { query?: string } = {}
            try {
              args = JSON.parse(call.function.arguments || '{}')
            } catch (e) {
              writeToolTag(`⚠️ 工具参数解析失败: ${(e as Error).message}`)
              workingMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: 'invalid arguments json' }),
              })
              continue
            }

            const query = (args.query || '').trim()
            if (!query) {
              writeToolTag('⚠️ 空 query')
              workingMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: 'empty query' }),
              })
              continue
            }

            writeToolTag(`🔍 搜索: ${query}`)
            try {
              const search = await tavilySearch(query, tavilyApiKey, {
                maxResults: AGENT.TAVILY_MAX_RESULTS,
                searchDepth: AGENT.TAVILY_SEARCH_DEPTH,
                dispatcher,
              }, fetch as any)

              writeToolTag(`✅ 共 ${search.results.length} 条结果`)
              // 来源以 Markdown 链接列表透出到展示面板，供用户点击溯源；
              // snippet 不进展示，仅随 toolContext 回灌给模型，避免面板冗长。
              if (search.results.length) {
                const sources = search.results
                  .map((r, i) => `${i + 1}. [${r.title || r.url}](${r.url})`)
                  .join('\n')
                writeToolTag(sources)
              }
              const compact = search.results.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 600) ?? '',
              }))
              workingMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(compact),
              })
            } catch (e) {
              const errMsg = (e as Error).message
              writeToolTag(`❌ 搜索失败: ${errMsg}`)
              workingMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: errMsg }),
              })
            }
          }

          round++
        }

        // 触顶：禁用工具，开启流式拿最终回答
        // 先回传已积累的搜索过程协议片段供客户端持久化
        flushToolContext()
        const finalInit = generatePayload(apiKey, workingMessages, temperature, model, {
          stream: true,
          // 同上：workingMessages 已含 tool_calls / role:'tool'，必须带 tools schema 才能通过上游校验
          tools: AGENT_TOOLS as any[],
          toolChoice: 'none',
          pretransformed: true,
        })
        if (dispatcher) (finalInit as any).dispatcher = dispatcher
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const finalResp = await fetch(`${baseUrl}/chat/completions`, finalInit) as Response
        if (!finalResp.ok) {
          const text = await finalResp.text().catch(() => '')
          controller.enqueue(encoder.encode(`\n\n[上游错误 ${finalResp.status}] ${text.slice(0, 300)}`))
          controller.close()
          return
        }
        await pipeOpenAIStreamToController(finalResp, controller, { closeWhenDone: true })
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[agent 异常] ${(e as Error).message}`))
        controller.close()
      }
    },
  })

  return new Response(stream)
}
