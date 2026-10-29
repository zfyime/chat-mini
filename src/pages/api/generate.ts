import { ProxyAgent, fetch } from 'undici'
import { buildOpenAIMessages, generatePayload, parseOpenAIStream, pipeOpenAIStreamToController } from '@/utils/chatCompletion'
import { verifySignature } from '@/utils/auth'
import { isValidPassword } from '@/utils/password'
import { tavilySearch } from '@/utils/tavily'
import { searxngSearch } from '@/utils/searxng'
import { AGENT, AVAILABLE_MODELS, CONFIG } from '@/config/constants'
import { AGENT_TOOLS } from '@/config/tools'
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

  // 联网开关打开且至少配置了一种搜索服务：走自动搜索流程。
  // 其余情况（开关关闭，或开启但未配置搜索服务）都走普通单次流式——
  // 联网默认开启，未配置时静默降级，不能因此让每条消息都报错。
  if (webSearch && (tavilyApiKey || searxngBaseUrl)) {
    return runWebSearchFlow({
      messages,
      temperature,
      model: modelToUse,
      dispatcher,
      streamTimeoutMs,
    })
  }

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

interface WebSearchFlowArgs {
  messages: any[]
  temperature: number
  model: string
  dispatcher?: any
  streamTimeoutMs?: number
}

// 取最后一条用户消息的纯文本，作为检索词缺失时的兜底 query。
// 带图片的消息 content 是数组，这里只保留 text 片段；附件全文也在这段文本里，
// 折叠空白并截断到 200 字符，避免超长内容变成无效检索词或撑爆搜索请求。
const lastUserText = (messages: any[]): string => {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUser) return ''
  const raw = typeof lastUser.content === 'string'
    ? lastUser.content
    : Array.isArray(lastUser.content)
      ? lastUser.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
      : ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200)
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
        // 第一轮：auto 模式。模型自主决定是否搜索，不搜索时这一轮就是最终回答。
        // 正文边解析边透传；一旦上游返回 tool_calls，pipe 会停止透传并交给下面的搜索流程。
        const firstInit = generatePayload(apiKey, workingMessages, temperature, model, {
          stream: true,
          tools: AGENT_TOOLS as any[],
          toolChoice: 'auto',
          pretransformed: true,
        })
        firstInit.signal = requestAbort.signal
        if (dispatcher) (firstInit as any).dispatcher = dispatcher

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const firstResp = await fetch(`${baseUrl}/chat/completions`, firstInit) as Response
        if (!firstResp.ok) {
          const text = await firstResp.text().catch(() => '')
          write(`\n\n[上游错误 ${firstResp.status}] ${text.slice(0, 300)}`)
          close()
          return
        }

        const firstResult = await pipeOpenAIStreamToController(firstResp, controller, {
          closeWhenDone: false,
          collectToolCalls: true,
        })

        // 没有工具调用：模型选择直接回答，第一轮正文已是最终结果
        const webSearchCalls = firstResult.toolCalls.filter(call => call?.function?.name === 'web_search')
        if (!webSearchCalls.length) {
          close()
          return
        }
        if (streamClosed) return

        // 回灌首轮 assistant 消息，保证下面的 tool 消息能对应上 tool_calls
        workingMessages.push({
          role: 'assistant',
          content: firstResult.content,
          tool_calls: webSearchCalls,
        })

        const toolMessages = await Promise.all(webSearchCalls.map(async(call) => {
          let args: { query?: any } = {}
          let parseError = ''
          try {
            args = JSON.parse(call.function.arguments || '{}')
          } catch (e) {
            parseError = (e as Error).message
          }

          const rawQuery = args.query
          let query = (Array.isArray(rawQuery) ? rawQuery.join(' ') : String(rawQuery ?? '')).trim()
          // 模型给了工具调用却拿不到有效检索词时退回原始问题，避免开关打开却没有真正搜索
          if (!query) {
            query = lastUserText(workingMessages)
            if (query) {
              writeToolTag(parseError
                ? `⚠️ 工具参数解析失败（${parseError}），使用原始问题搜索`
                : '⚠️ 检索词为空，使用原始问题搜索')
            }
          }
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
