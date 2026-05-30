import { createTagParser } from './tagParser'

interface ThinkTagParserOptions {
  onMessage: (chunk: string) => void
  onThink: (chunk: string) => void
}

interface ThinkTagParser {
  process: (chunk: string) => void
  reset: () => void
}

// 兼容包装：原有调用方仅需 think 一个 tag
export const createThinkTagParser = ({ onMessage, onThink }: ThinkTagParserOptions): ThinkTagParser => {
  return createTagParser({
    tags: ['think'],
    onText: onMessage,
    onTag: (_tag, chunk) => onThink(chunk),
  })
}
