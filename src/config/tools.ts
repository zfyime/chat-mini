// 给上游模型声明的工具列表（OpenAI tools 协议）
// 只暴露一个 web_search 工具。是否允许联网由用户开关决定；开关打开后由模型自主判断
// 当前问题是否需要实时信息，需要时调用本工具，不需要就直接回答。

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '搜索互联网获取实时信息。当用户询问最新事件、当前数据、需要事实核查，或你对答案不确定时使用；日常闲聊、写作和纯代码问题不要调用。',
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
