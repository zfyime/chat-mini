import { createSignal, onMount, onCleanup } from 'solid-js'
import MarkdownIt from 'markdown-it'
import mdKatex from 'markdown-it-katex'
import mdHighlight from 'markdown-it-highlightjs'
import { useClipboard, useEventListener } from 'solidjs-use'
import IconRefresh from './icons/Refresh'
import type { Accessor } from 'solid-js'
import type { ChatMessage } from '@/types'

interface Props {
  role: ChatMessage['role']
  message: Accessor<string> | string
  thinkMessage: Accessor<string> | string
  showRetry?: Accessor<boolean>
  onRetry?: () => void
}

export default ({ role, message, thinkMessage, showRetry, onRetry }: Props) => {
  const roleClass = {
    system: 'bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300',
    user: 'bg-gradient-to-r from-purple-400 to-yellow-400',
    assistant: 'bg-gradient-to-r from-yellow-200 via-green-200 to-green-300',
  }
  const [source, setSource] = createSignal('')
  const { copy, copied } = useClipboard({ source, copiedDuring: 1000 })

  const md = (() => {
    const instance = new MarkdownIt({
      linkify: true,
      breaks: true,
    }).use(mdKatex).use(mdHighlight)
    
    const fence = instance.renderer.rules.fence!
    instance.renderer.rules.fence = (...args) => {
      const [tokens, idx] = args
      const token = tokens[idx]
      const rawCode = fence(...args)

      return `<div class="relative">
        <div data-code="${encodeURIComponent(token.content)}" class="copy-btn gpt-copy-btn group">
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32"><path fill="currentColor" d="M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" /><path fill="currentColor" d="M4 18H2V4a2 2 0 0 1 2-2h14v2H4Z" /></svg>
          <div class="group-hover:op-100 gpt-copy-tips">
            ${copied() ? '已复制' : '复制'}
          </div>
        </div>
        ${rawCode}
      </div>`
    }
    return instance
  })()

  const renderMarkdown = (content: Accessor<string> | string) => {
    if (typeof content === 'function') {
      return md.render(content() || '')
    } else if (typeof content === 'string') {
      return md.render(content)
    }
    return ''
  }

  const htmlString = () => renderMarkdown(message)
  const thinkHtmlString = () => renderMarkdown(thinkMessage)

  const handleCopyClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    let code: string | null = null

    if (el.matches('div.copy-btn')) {
      code = el.dataset.code ? decodeURIComponent(el.dataset.code) : null
    } else if (el.closest('div.copy-btn')) {
      const btn = el.closest('div.copy-btn') as HTMLElement
      code = btn.dataset.code ? decodeURIComponent(btn.dataset.code) : null
    }
    
    if (code) {
      setSource(code)
      copy()
    }
  }

  // Attach event listener to the message container
  let messageRef: HTMLDivElement
  onMount(() => {
    if (messageRef) {
      messageRef.addEventListener('click', handleCopyClick)
    }
  })
  onCleanup(() => {
    if (messageRef) {
      messageRef.removeEventListener('click', handleCopyClick)
    }
  })

  return (
    <div class="py-2 -mx-4 px-4 transition-colors md:hover:bg-slate/3">
      <div class="flex gap-3 rounded-lg" class:op-75={role === 'user'}>
        <div class={`shrink-0 w-7 h-7 mt-4 rounded-full op-80 ${roleClass[role]}`} />
        <div ref={messageRef!} class="message prose break-words overflow-hidden">
          {thinkMessage && (typeof thinkMessage === 'function' ? thinkMessage() !== "" : thinkMessage !== "") && (
            <details open={!onRetry}>
              <summary>{message && (typeof message === 'function' ? message() !== "" : message !== "") ? '思考过程' : '思考中...'}</summary>
              <div innerHTML={thinkHtmlString()} />
            </details>
          )}
          <div innerHTML={htmlString()} />
        </div>
      </div>
      {showRetry?.() && onRetry && (
        <div class="fie px-3 mb-2">
          <div onClick={onRetry} class="gpt-retry-btn">
            <IconRefresh />
            <span>重新生成</span>
          </div>
        </div>
      )}
    </div>
  )
}
