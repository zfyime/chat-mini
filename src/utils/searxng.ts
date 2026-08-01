// SearXNG 网络搜索客户端（自部署实例，需在 settings.yml 中启用 json 输出格式）
// docs: https://docs.searxng.org/dev/search_api.html

import type { TavilyResult, TavilySearchResponse } from './tavily'

export interface SearxngSearchOptions {
  maxResults?: number
  // 透传 undici 代理 dispatcher，复用 generate.ts 现有代理配置
  dispatcher?: any
}

// 返回结构与 Tavily 对齐，方便 generate.ts 无差别消费
export const searxngSearch = async(
  query: string,
  baseUrl: string,
  opts: SearxngSearchOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<TavilySearchResponse> => {
  const url = `${baseUrl.replace(/\/$/, '')}/search?${new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'general',
  })}`
  const init: any = { method: 'GET' }
  if (opts.dispatcher) init.dispatcher = opts.dispatcher

  const res = await fetchImpl(url, init) as Response
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`SearXNG ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { results?: Array<{ title?: string, url?: string, content?: string, score?: number }> }

  // SearXNG 不支持 max_results 参数，在这里截断
  const results: TavilyResult[] = (data.results ?? [])
    .slice(0, opts.maxResults ?? 5)
    .map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
      score: r.score,
    }))
  return { query, results }
}
