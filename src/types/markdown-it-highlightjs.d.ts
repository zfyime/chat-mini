// markdown-it-highlightjs 只为默认入口提供了类型声明，core 子路径没有随包发布 .d.ts。
// 这里补一份最小声明，避免改用 core 入口后丢失类型。
declare module 'markdown-it-highlightjs/core' {
  import type MarkdownIt from 'markdown-it'
  import type { HLJSApi } from 'highlight.js'

  interface CoreOptions {
    hljs?: HLJSApi
    auto?: boolean
    code?: boolean
    inline?: boolean
    ignoreIllegals?: boolean
  }

  const plugin: (md: MarkdownIt, opts?: CoreOptions) => void
  export default plugin
}
