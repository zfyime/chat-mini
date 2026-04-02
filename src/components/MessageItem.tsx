import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import MarkdownIt from 'markdown-it'
import mdKatex from 'markdown-it-katex'
import mdHighlight from 'markdown-it-highlightjs'
import IconRefresh from './icons/Refresh'
import IconExport from './icons/Export'
import IconCopy from './icons/Copy'
import IconDelete from './icons/Delete'
import FileAttachments from './FileAttachments'
import type { Accessor } from 'solid-js'
import type { ChatMessage } from '@/types'

interface Props {
  role: ChatMessage['role']
  message: Accessor<string> | string
  thinkMessage: Accessor<string> | string
  attachments?: ChatMessage['attachments']
  showRetry?: Accessor<boolean>
  onRetry?: () => void
  showExportMenu?: Accessor<boolean>
  onToggleExportMenu?: (e: MouseEvent) => void
  onExport?: (format: 'markdown' | 'json' | 'text') => void
  onCopyMessage?: (content: string) => void
  onDeleteMessage?: () => void
}

export default ({
  role,
  message,
  thinkMessage,
  attachments,
  showRetry,
  onRetry,
  showExportMenu,
  onToggleExportMenu,
  onExport,
  onCopyMessage,
  onDeleteMessage,
}: Props) => {
  const isUserMessage = role === 'user'
  const [source, setSource] = createSignal('')
  const [codeCopied, setCodeCopied] = createSignal(false)

  // Simple clipboard implementation for code blocks
  const copy = async() => {
    try {
      await navigator.clipboard.writeText(source())
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Copy entire message content
  const copyMessage = async() => {
    try {
      const content = typeof message === 'function' ? message() : message
      await navigator.clipboard.writeText(content || '')
      onCopyMessage?.(content || '')
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }

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
        <div data-code="${encodeURIComponent(token.content)}" class="copy-btn gpt-copy-btn group/copy rounded-md">
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32"><path fill="currentColor" d="M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" /><path fill="currentColor" d="M4 18H2V4a2 2 0 0 1 2-2h14v2H4Z" /></svg>
          <div class="group-hover/copy:op-100 gpt-copy-tips">
            ${codeCopied() ? '已复制' : '复制'}
          </div>
        </div>
        ${rawCode}
      </div>`
    }
    return instance
  })()

  const renderMarkdown = (content: Accessor<string> | string) => {
    if (typeof content === 'function')
      return md.render(content() || '')
    else if (typeof content === 'string')
      return md.render(content)

    return ''
  }

  const htmlString = () => renderMarkdown(message)
  const thinkHtmlString = () => renderMarkdown(thinkMessage)
  const htmlStringWithCopyState = () => {
    codeCopied()
    return htmlString()
  }
  const thinkHtmlStringWithCopyState = () => {
    codeCopied()
    return thinkHtmlString()
  }

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
    if (messageRef)
      messageRef.addEventListener('click', handleCopyClick)
  })
  onCleanup(() => {
    if (messageRef)
      messageRef.removeEventListener('click', handleCopyClick)
  })

  return (
    <div class="md:py-2 md:px-4 transition-colors md:hover:bg-slate/3 group">
      <div class={`flex rounded-lg ${isUserMessage ? 'justify-end' : ''}`}>
        <div ref={messageRef!} class={`message prose break-words overflow-hidden flex-1 relative md:pr-12 ${isUserMessage ? 'text-right' : ''}`}>
          {/* Message action buttons - only visible on hover */}
          <div class="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-0.5 p-0.5 bg-slate/10 dark:bg-slate/20 rounded-lg shadow-sm z-20">
            <button
              onClick={copyMessage}
              title="复制消息"
              class="inline-fcc w-6 h-6 rounded text-sm text-gray-600 hover:text-gray-800 dark:text-slate-200 dark:hover:text-white hover:bg-slate/12 active:bg-slate/20 transition-colors"
            >
              <IconCopy />
            </button>
            {onDeleteMessage && (
              <button
                onClick={onDeleteMessage}
                title="删除消息"
                class="inline-fcc w-6 h-6 rounded text-sm text-gray-600 hover:text-red-600 dark:text-slate-200 dark:hover:text-red-400 hover:bg-red/10 active:bg-red/15 transition-colors"
              >
                <IconDelete />
              </button>
            )}
          </div>

          {thinkMessage && (typeof thinkMessage === 'function' ? thinkMessage() !== '' : thinkMessage !== '') && (
            <details open={!onRetry}>
              <summary>{message && (typeof message === 'function' ? message() !== '' : message !== '') ? '思考过程' : '思考中...'}</summary>
              <div innerHTML={thinkHtmlStringWithCopyState()} />
            </details>
          )}
          <div innerHTML={htmlStringWithCopyState()} />

          {/* Show attachments if present */}
          <Show when={attachments && attachments.length > 0}>
            <FileAttachments attachments={attachments!} />
          </Show>
        </div>
      </div>
      {showRetry?.() && (
        <div class="flex items-center justify-between px-8 mb-24">
          <Show when={onExport && onToggleExportMenu && showExportMenu}>
            <div class="relative">
              <div onClick={onToggleExportMenu} class="gpt-retry-btn" title="导出对话">
                <IconExport />
                <span>导出</span>
              </div>
              <Show when={showExportMenu?.()}>
                <div
                  class="export-menu absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 min-w-[120px] z-50"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg transition-colors text-sm"
                    onClick={() => onExport?.('markdown')}
                  >
                    Markdown
                  </button>
                  <button
                    class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                    onClick={() => onExport?.('json')}
                  >
                    JSON
                  </button>
                  <button
                    class="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg transition-colors text-sm"
                    onClick={() => onExport?.('text')}
                  >
                    纯文本
                  </button>
                </div>
              </Show>
            </div>
          </Show>
          <Show when={onRetry}>
            <div onClick={onRetry} class="gpt-retry-btn">
              <IconRefresh />
              <span>重新生成</span>
            </div>
          </Show>
        </div>
      )}
    </div>
  )
}
