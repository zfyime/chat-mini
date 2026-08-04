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

// 联网规划阶段要求模型只能做工具决策，不能提前生成一遍完整答案。
// 当问题不依赖实时信息时，模型调用此工具，服务端会跳过搜索并直接进入最终流式回答。
export const SKIP_WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'skip_web_search',
    description: '仅当问题完全不依赖实时信息、无需联网搜索也能可靠回答时调用。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
} as const

export const AGENT_TOOLS = [WEB_SEARCH_TOOL]
export const WEB_SEARCH_PLANNER_TOOLS = [WEB_SEARCH_TOOL, SKIP_WEB_SEARCH_TOOL]
