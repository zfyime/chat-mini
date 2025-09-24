interface ThinkTagParserOptions {
  onMessage: (chunk: string) => void
  onThink: (chunk: string) => void
}

interface ThinkTagParser {
  process: (chunk: string) => void
  reset: () => void
}

export const createThinkTagParser = ({ onMessage, onThink }: ThinkTagParserOptions): ThinkTagParser => {
  let buffer = ''
  let inThinkTag = false

  const process = (chunk: string) => {
    buffer += chunk

    while (buffer) {
      if (inThinkTag) {
        const endTagIndex = buffer.indexOf('</think>')
        if (endTagIndex !== -1) {
          const thinkContent = buffer.slice(0, endTagIndex)
          if (thinkContent)
            onThink(thinkContent)

          buffer = buffer.slice(endTagIndex + 8)
          inThinkTag = false
        } else {
          if (buffer)
            onThink(buffer)
          buffer = ''
          break
        }
      } else {
        const startTagIndex = buffer.indexOf('<think>')
        if (startTagIndex !== -1) {
          const messageContent = buffer.slice(0, startTagIndex)
          if (messageContent)
            onMessage(messageContent)

          buffer = buffer.slice(startTagIndex + 7)
          inThinkTag = true
        } else {
          if (buffer)
            onMessage(buffer)
          buffer = ''
          break
        }
      }
    }
  }

  const reset = () => {
    buffer = ''
    inThinkTag = false
  }

  return { process, reset }
}
