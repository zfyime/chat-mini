// OpenAI 兼容上游的工具调用（tool_calls）聚合与解析工具。
// 从 generate.ts 拆出：这些逻辑与路由本身无关，且部分上游（DeepSeek 系等）
// 会以非标准方式输出工具调用，需要统一清洗。

// 聚合流式 delta 里的 tool_calls 分片：index 对位累加，name/arguments 增量拼接。
export const mergeToolCallDelta = (toolCalls: any[], deltaToolCalls: any[]) => {
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

// 清洗上游返回的 tool_calls：补默认 id/type，arguments 兜底为 '{}'，过滤无名调用。
export const normalizeToolCalls = (toolCalls: any[], round: number) => {
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

const decodeXmlText = (value: string) => value
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, '\'')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

// 兼容部分上游把工具调用当正文 XML 输出（<tool_call><arg_key>...），
// 解析出来并把标签从正文中剔除。
export const parseXmlStyleToolCalls = (content: string) => {
  const calls: any[] = []
  const cleanedContent = content.replace(/<tool_call>([\s\S]*?)<\/tool_call>/g, (_full, body) => {
    const name = body.split('<arg_key>')[0].trim()
    if (!name) return ''

    const args: Record<string, string> = {}
    body.replace(/<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g, (_argFull, key, value) => {
      const argKey = decodeXmlText(key.trim())
      if (argKey) args[argKey] = decodeXmlText(value.trim())
      return ''
    })

    calls.push({
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    })
    return ''
  }).trim()

  return { calls, cleanedContent }
}
