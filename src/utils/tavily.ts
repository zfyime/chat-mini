// Tavily 网络搜索客户端
// docs: https://docs.tavily.com/docs/rest-api/api-reference

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

export interface TavilyResult {
  title: string
  url: string
  content: string
  score?: number
}

export interface TavilySearchResponse {
  query: string
  results: TavilyResult[]
  answer?: string
}

export interface TavilySearchOptions {
  maxResults?: number
  searchDepth?: 'basic' | 'advanced'
  // 透传 undici 代理 dispatcher，复用 generate.ts 现有代理配置
  dispatcher?: any
}

export const tavilySearch = async(
  query: string,
  apiKey: string,
  opts: TavilySearchOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<TavilySearchResponse> => {
  const init: any = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: opts.maxResults ?? 5,
      search_depth: opts.searchDepth ?? 'basic',
      include_answer: false,
    }),
  }
  if (opts.dispatcher) init.dispatcher = opts.dispatcher

  const res = await fetchImpl(TAVILY_ENDPOINT, init) as Response
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tavily ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<TavilySearchResponse>
}
