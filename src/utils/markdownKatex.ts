import katex from 'katex'
import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline'
import type Token from 'markdown-it/lib/token'
import type { KatexOptions } from 'katex'

const DOLLAR = 0x24
const SPACE = 0x20
const TAB = 0x09
const ZERO = 0x30
const NINE = 0x39

const isValidDelimiter = (state: StateInline, pos: number) => {
  const prevChar = pos > 0 ? state.src.charCodeAt(pos - 1) : -1
  const nextChar = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1

  return {
    canOpen: nextChar !== SPACE && nextChar !== TAB,
    canClose: prevChar !== SPACE && prevChar !== TAB && (nextChar < ZERO || nextChar > NINE),
  }
}

const mathInline = (state: StateInline, silent: boolean) => {
  if (state.src.charCodeAt(state.pos) !== DOLLAR) return false

  const open = isValidDelimiter(state, state.pos)
  if (!open.canOpen) {
    if (!silent) state.pending += '$'
    state.pos += 1
    return true
  }

  const start = state.pos + 1
  let match = start
  for (;;) {
    match = state.src.indexOf('$', match)
    if (match === -1) break

    // 只把未转义的 $ 当作结束符，避免误切公式内容。
    let pos = match - 1
    while (state.src[pos] === '\\') pos -= 1
    if ((match - pos) % 2 === 1) break
    match += 1
  }

  if (match === -1) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  if (match === start) {
    if (!silent) state.pending += '$$'
    state.pos = start + 1
    return true
  }

  const close = isValidDelimiter(state, match)
  if (!close.canClose) {
    if (!silent) state.pending += '$'
    state.pos = start
    return true
  }

  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.markup = '$'
    token.content = state.src.slice(start, match)
  }

  state.pos = match + 1
  return true
}

const mathBlock = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
  let pos = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]

  if (pos + 2 > max) return false
  if (state.src.slice(pos, pos + 2) !== '$$') return false
  if (silent) return true

  pos += 2
  let firstLine = state.src.slice(pos, max)
  let lastLine = ''
  let found = false
  let nextLine = startLine

  if (firstLine.trim().slice(-2) === '$$') {
    firstLine = firstLine.trim().slice(0, -2)
    found = true
  }

  while (!found) {
    nextLine += 1
    if (nextLine >= endLine) break

    pos = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineMax = state.eMarks[nextLine]
    if (pos < lineMax && state.tShift[nextLine] < state.blkIndent) break

    if (state.src.slice(pos, lineMax).trim().slice(-2) === '$$') {
      const lastPos = state.src.slice(0, lineMax).lastIndexOf('$$')
      lastLine = state.src.slice(pos, lastPos)
      found = true
    }
  }

  state.line = nextLine + 1

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = `${firstLine && firstLine.trim() ? `${firstLine}\n` : ''}${state.getLines(startLine + 1, nextLine, state.tShift[startLine], true)}${lastLine && lastLine.trim() ? lastLine : ''}`
  token.map = [startLine, state.line]
  token.markup = '$$'
  return true
}

const renderKatex = (content: string, displayMode: boolean, options: KatexOptions) => {
  try {
    return katex.renderToString(content, {
      ...options,
      displayMode,
      throwOnError: false,
    })
  } catch {
    return content
  }
}

export default function markdownKatex(md: MarkdownIt, options: KatexOptions = {}) {
  md.inline.ruler.after('escape', 'math_inline', mathInline)
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })

  md.renderer.rules.math_inline = (tokens: Token[], idx: number) =>
    renderKatex(tokens[idx].content, false, options)

  md.renderer.rules.math_block = (tokens: Token[], idx: number) =>
    `<p>${renderKatex(tokens[idx].content, true, options)}</p>\n`
}
