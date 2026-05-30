// 给上游模型声明的工具列表（OpenAI tools 协议）
// 当前只暴露一个 web_search 工具。

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索互联网获取实时信息。当用户询问最新事件、当前数据、需要事实核查或你不确定答案时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词。使用用户问题中的核心词，可适当英文化以提升覆盖。',
        },
      },
      required: ['query'],
    },
  },
} as const

export const AGENT_TOOLS = [WEB_SEARCH_TOOL]
