// 通用的 SSE 流文本 tag 分流器。
// 输入是一段段到达的文本，输出会按"当前所在的 tag"分发到对应回调。
// 例如 tags=['think','tool']，则 <think>...</think>、<tool>...</tool> 的内容
// 会分别发到 onTag('think', chunk) / onTag('tool', chunk)，
// 其他文本走 onText(chunk)。

interface TagParserOptions {
  tags: string[]
  onText: (chunk: string) => void
  onTag: (tag: string, chunk: string) => void
}

interface TagParser {
  process: (chunk: string) => void
  reset: () => void
}

export const createTagParser = ({ tags, onText, onTag }: TagParserOptions): TagParser => {
  let buffer = ''
  let inTag: string | null = null

  // 在缓冲区里找最早出现的 <tagName> 起始位置
  const findFirstOpen = (): { tag: string, index: number } | null => {
    let best: { tag: string, index: number } | null = null
    for (const t of tags) {
      const idx = buffer.indexOf(`<${t}>`)
      if (idx !== -1 && (best === null || idx < best.index))
        best = { tag: t, index: idx }
    }
    return best
  }

  // 找到一个 tag 起始的字符 `<`，并且后续可能是某个 tag 的前缀（但还不完整），
  // 此时不能贸然把 buffer 全 flush 给 onText，否则会把半截标签也输出。
  const hasPossiblePartialOpen = (): boolean => {
    const lt = buffer.lastIndexOf('<')
    if (lt === -1) return false
    const tail = buffer.slice(lt)
    return tags.some(t => `<${t}>`.startsWith(tail))
  }

  const hasPossiblePartialClose = (tag: string): boolean => {
    const lt = buffer.lastIndexOf('<')
    if (lt === -1) return false
    const tail = buffer.slice(lt)
    return `</${tag}>`.startsWith(tail)
  }

  const process = (chunk: string) => {
    buffer += chunk

    while (buffer) {
      if (inTag) {
        const closeToken = `</${inTag}>`
        const endIdx = buffer.indexOf(closeToken)
        if (endIdx !== -1) {
          const content = buffer.slice(0, endIdx)
          if (content) onTag(inTag, content)
          buffer = buffer.slice(endIdx + closeToken.length)
          inTag = null
        } else {
          // 末尾可能是半截 </xxx>，保留以便下一轮拼接
          if (hasPossiblePartialClose(inTag)) {
            const lt = buffer.lastIndexOf('<')
            const safe = buffer.slice(0, lt)
            if (safe) onTag(inTag, safe)
            buffer = buffer.slice(lt)
          } else {
            onTag(inTag, buffer)
            buffer = ''
          }
          break
        }
      } else {
        const open = findFirstOpen()
        if (open) {
          const before = buffer.slice(0, open.index)
          if (before) onText(before)
          buffer = buffer.slice(open.index + open.tag.length + 2) // 跳过 <tag>
          inTag = open.tag
        } else {
          // 没找到任何完整起始标签；如果末尾像是半截 <think 这种就保留
          if (hasPossiblePartialOpen()) {
            const lt = buffer.lastIndexOf('<')
            const safe = buffer.slice(0, lt)
            if (safe) onText(safe)
            buffer = buffer.slice(lt)
          } else {
            onText(buffer)
            buffer = ''
          }
          break
        }
      }
    }
  }

  const reset = () => {
    buffer = ''
    inTag = null
  }

  return { process, reset }
}
