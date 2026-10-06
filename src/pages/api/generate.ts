import { ProxyAgent, fetch } from 'undici'
import { buildOpenAIMessages, generatePayload, parseOpenAIStream, pipeOpenAIStreamToController } from '@/utils/chatCompletion'
import { verifySignature } from '@/utils/auth'
import { isValidPassword } from '@/utils/password'
import { tavilySearch } from '@/utils/tavily'
import { searxngSearch } from '@/utils/searxng'
import { mergeToolCallDelta, normalizeToolCalls, parseXmlStyleToolCalls } from '@/utils/toolCallUtils'
import { AGENT, AVAILABLE_MODELS, CONFIG } from '@/config/constants'
import { AGENT_TOOLS, WEB_SEARCH_PLANNER_TOOLS } from '@/config/tools'
import type { APIRoute } from 'astro'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const tavilyApiKey = import.meta.env.TAVILY_API_KEY
const searxngBaseUrl = (import.meta.env.SEARXNG_BASE_URL || '').trim().replace(/\/$/, '')
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com/v1').trim().replace(/\/$/, '')
const allowedModels = AVAILABLE_MODELS.map(m => m.id)
// 未传 model 时的兜底模型
const fallbackModel = CONFIG.DEFAULT_MODEL

// 统一的错误响应构造，避免各处手写 Response + JSON.stringify
const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: { message } }), { status })

// 流式响应看门狗时长（毫秒）：到点主动截断并给出提示，防止平台墙钟（Vercel Hobby 60s，
// 见 astro.config.mjs maxDuration）强杀 function 后前端拿到无收尾残流（只有思考没有正文）。
// 显式配置 STREAM_TIMEOUT_MS 优先（0 为禁用）；未配置时 Vercel 环境默认 55s（预留 5s 收尾余量），自托管默认禁用。
const rawStreamTimeout = import.meta.env.STREAM_TIMEOUT_MS
const streamTimeoutMs = rawStreamTimeout !== undefined && String(rawStreamTimeout).trim() !== ''
  ? Math.max(0, Number(rawStreamTimeout) || 0)
  : (import.meta.env.VERCEL ? 55_000 : 0)

export const POST: APIRoute = async(context) => {
  const body = await context.request.json()
  const { sign, time, messages, pass, temperature, model, webSearch } = body
  if (!messages)
    return jsonError('No input text.', 400)
  if (!isValidPassword(pass))
    return jsonError('Invalid password.', 401)
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign))
    return jsonError('Invalid signature.', 401)

  const modelToUse = model || fallbackModel

  if (!allowedModels.includes(modelToUse))
    return jsonError(`Model ${modelToUse} is not allowed.`, 400)

  const dispatcher = httpsProxy ? new ProxyAgent(httpsProxy) : undefined

  // 联网搜索开关关闭：走原有的单次流式逻辑
  if (!webSearch) {
    const initOptions = generatePayload(apiKey, messages, temperature, modelToUse)
    if (dispatcher) initOptions.dispatcher = dispatcher

    const response = await fetch(`${baseUrl}/chat/completions`, initOptions).catch((err: Error) => {
      console.error(err)
      return new Response(JSON.stringify({
        error: {
          code: err.name,
          message: err.message,
        },
      }), { status: 500 })
    }) as Response

    return await parseOpenAIStream(response, { timeoutMs: streamTimeoutMs }) as Response
  }

  // 联网开但 Tavily 和 SearXNG 都未配置
  if (!tavilyApiKey && !searxngBaseUrl)
    return jsonError('未配置 TAVILY_API_KEY 或 SEARXNG_BASE_URL，无法使用联网搜索。', 400)

  return runWebSearchFlow({
    messages,
    temperature,
    model: modelToUse,
    dispatcher,
    streamTimeoutMs,
  })
}

interface WebSearchFlowArgs {
  messages: any[]
  temperature: number
  model: string
  dispatcher?: any
  streamTimeoutMs?: number
}

// 解析 planner 响应（非流式，标准 JSON），提取 assistant message。
// 兼容两类非标准输出：流式 SSE 帧（部分上游无视 stream:false）与 XML 风格工具调用。
const parseAgentProbeResponse = (rawText: string) => {
  const json = rawText.split('\n').some(line => line.startsWith('data: '))
    ? parseSseAgentResponse(rawText)
    : JSON.parse(rawText)

  // XML 风格的工具调用两种响应格式下都可能出现，统一在这一层兜底，
  // 否则非流式分支（JSON）会漏掉这类上游，静默降级成不搜索。
  const message = json?.choices?.[0]?.message
  if (message && !message.tool_calls?.length && message.content) {
    const parsed = parseXmlStyleToolCalls(message.content)
    if (parsed.calls.length) {
      message.tool_calls = parsed.calls
      message.content = parsed.cleanedContent
    }
  }

  return json
}

// 部分兼容上游会无视 stream:false 仍按 SSE 返回，这里聚合出完整 message。
const parseSseAgentResponse = (rawText: string) => {
  const message: any = { role: 'assistant', content: '' }
  const toolCalls: any[] = []
  let reasoningContent = ''

  rawText.split('\n').forEach((line) => {
    if (!line.startsWith('data: ')) return
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') return

    // 单帧解析失败不应拖垮整轮 agent：跳过异常/非 JSON 帧（如 keep-alive、半截内容）。
    let json: any
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
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

  // XML 风格兜底由 parseAgentProbeResponse 统一处理，这里只汇总标准 tool_calls
  if (toolCalls.length) message.tool_calls = toolCalls
  if (reasoningContent) message.reasoning_content = reasoningContent

  return { choices: [{ message }] }
}

const runWebSearchFlow = ({ messages, temperature, model, dispatcher, streamTimeoutMs = 0 }: WebSearchFlowArgs): Response => {
  const encoder = new TextEncoder()
  // 把项目内的 ChatMessage 转成 OpenAI 协议消息后作为初始 workingMessages
  const workingMessages: any[] = buildOpenAIMessages(messages)
  // 记录初始长度：之后只追加本轮真实搜索的协议消息，供下一轮继续复用搜索结果。
  const initialLen = workingMessages.length

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamClosed = false
      const requestAbort = new AbortController()
      const write = (content: string) => {
        if (streamClosed) return
        controller.enqueue(encoder.encode(content))
      }
      const close = () => {
        if (streamClosed) return
        streamClosed = true
        requestAbort.abort()
        controller.close()
      }
      const writeToolTag = (body: string) => {
        // 搜索标题或 URL 中的 '<' 不能破坏客户端的工具标签解析。
        const safe = body.replace(/</g, '&lt;')
        write(`<tool>${safe}\n</tool>`)
      }
      const flushToolContext = () => {
        const toolContext = workingMessages.slice(initialLen)
        if (!toolContext.length) return

        const json = JSON.stringify(toolContext).replace(/</g, '\\u003c')
        write(`<tool_data>${json}</tool_data>`)
      }

      const watchdog = streamTimeoutMs > 0
        ? setTimeout(() => {
          write('\n\n_⚠️ 响应超时中断，请重试_')
          close()
        }, streamTimeoutMs)
        : undefined

      try {
        // 规划阶段只允许调用 web_search 或 skip_web_search，禁止提前生成完整答案。
        // 一次规划可以返回多个 web_search，搜索完成后直接进入唯一一次最终流式生成。
        // 非流式请求直接拿聚合 JSON；parseAgentProbeResponse 兼容仍返回 SSE 的上游。
        const plannerInit = generatePayload(apiKey, workingMessages, 0, model, {
          stream: false,
          tools: WEB_SEARCH_PLANNER_TOOLS as any[],
          toolChoice: 'required',
          pretransformed: true,
        })
        plannerInit.signal = requestAbort.signal
        if (dispatcher) (plannerInit as any).dispatcher = dispatcher

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const plannerResp = await fetch(`${baseUrl}/chat/completions`, plannerInit) as Response
        let plannerCalls: any[] = []
        if (plannerResp.ok) {
          const plannerRawText = await plannerResp.text()
          let plannerJson: any
          try {
            plannerJson = parseAgentProbeResponse(plannerRawText)
          } catch (e) {
            console.error('Failed to parse planner response:', e)
          }
          const plannerMessage = plannerJson?.choices?.[0]?.message
          plannerCalls = plannerMessage?.tool_calls
            ? normalizeToolCalls(plannerMessage.tool_calls, 0)
            : []
        } else {
          // required 在部分兼容上游会直接返回错误；释放响应体后按不搜索降级。
          await plannerResp.text().catch(() => '')
        }

        // 部分兼容上游会忽略 tool_choice: required 并返回纯文本。
        // 规划失败或没有工具调用时都按 skip_web_search 降级，确保用户仍能拿到最终回答。
        const webSearchCalls = plannerCalls.filter(call => call?.function?.name === 'web_search')
        if (streamClosed) return

        if (webSearchCalls.length) {
          // skip_web_search 仅用于表达“不搜索”，不写入最终上下文；真实搜索调用才需要回灌。
          workingMessages.push({
            role: 'assistant',
            content: '',
            tool_calls: webSearchCalls,
          })

          const toolMessages = await Promise.all(webSearchCalls.map(async(call) => {
            let args: { query?: any } = {}
            try {
              args = JSON.parse(call.function.arguments || '{}')
            } catch (e) {
              writeToolTag(`⚠️ 工具参数解析失败: ${(e as Error).message}`)
              return {
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: 'invalid arguments json' }),
              }
            }

            const rawQuery = args.query
            const query = (Array.isArray(rawQuery) ? rawQuery.join(' ') : String(rawQuery ?? '')).trim()
            if (!query) {
              writeToolTag('⚠️ 空 query')
              return {
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: 'empty query' }),
              }
            }

            writeToolTag(`🔍 搜索: ${query}`)
            try {
              let search
              try {
                if (!tavilyApiKey) throw new Error('未配置 TAVILY_API_KEY')
                search = await tavilySearch(query, tavilyApiKey, {
                  maxResults: AGENT.TAVILY_MAX_RESULTS,
                  searchDepth: AGENT.TAVILY_SEARCH_DEPTH,
                  signal: requestAbort.signal,
                  dispatcher,
                }, fetch as any)
              } catch (tavilyErr) {
                if (requestAbort.signal.aborted || !searxngBaseUrl) throw tavilyErr
                writeToolTag(`⚠️ ${query}：Tavily 失败（${(tavilyErr as Error).message}），降级到 SearXNG`)
                search = await searxngSearch(query, searxngBaseUrl, {
                  maxResults: AGENT.SEARXNG_MAX_RESULTS,
                  signal: requestAbort.signal,
                  dispatcher,
                }, fetch as any)
              }

              writeToolTag(`✅ ${query}：共 ${search.results.length} 条结果`)
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
              return {
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(compact),
              }
            } catch (e) {
              const errMsg = (e as Error).message
              if (!streamClosed) writeToolTag(`❌ ${query}：搜索失败，${errMsg}`)
              return {
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: errMsg }),
              }
            }
          }))
          workingMessages.push(...toolMessages)
        }

        if (streamClosed) return
        flushToolContext()
        const finalInit = generatePayload(apiKey, workingMessages, temperature, model, {
          stream: true,
          // 搜索后必须继续提供工具 schema 以兼容严格校验 tool_calls 历史的上游，但禁止再次调用。
          tools: AGENT_TOOLS as any[],
          toolChoice: 'none',
          pretransformed: true,
        })
        finalInit.signal = requestAbort.signal
        if (dispatcher) (finalInit as any).dispatcher = dispatcher

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const finalResp = await fetch(`${baseUrl}/chat/completions`, finalInit) as Response
        if (!finalResp.ok) {
          const text = await finalResp.text().catch(() => '')
          write(`\n\n[上游错误 ${finalResp.status}] ${text.slice(0, 300)}`)
          close()
          return
        }

        await pipeOpenAIStreamToController(finalResp, controller, { closeWhenDone: false })
        close()
      } catch (e) {
        write(`\n\n[agent 异常] ${(e as Error).message}`)
        close()
      } finally {
        if (watchdog) clearTimeout(watchdog)
      }
    },
  })

  return new Response(stream)
}
