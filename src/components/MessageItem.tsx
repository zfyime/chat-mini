import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import MarkdownIt from 'markdown-it'
import mdKatex from 'markdown-it-katex'
import mdHighlight from 'markdown-it-highlightjs'
import IconRefresh from './icons/Refresh'
import IconExport from './icons/Export'
import IconCopy from './icons/Copy'
import IconDelete from './icons/Delete'
import IconEdit from './icons/Edit'
import FileAttachments from './FileAttachments'
import type { Accessor } from 'solid-js'
import type { ChatMessage } from '@/types'

// 模块级单例：所有 MessageItem 共享同一个 MarkdownIt 实例，避免每条消息重复 new 与插件注册。
// fence 规则不再读取任何组件级状态（复制反馈改为直接操作被点击按钮的 DOM），因此可安全共享。
const md = new MarkdownIt({
  linkify: true,
  breaks: true,
}).use(mdKatex).use(mdHighlight)

const defaultFence = md.renderer.rules.fence!
md.renderer.rules.fence = (...args) => {
  const [tokens, idx] = args
  const token = tokens[idx]
  const rawCode = defaultFence(...args)

  return `<div class="relative">
    <div data-code="${encodeURIComponent(token.content)}" class="copy-btn gpt-copy-btn group/copy rounded-md">
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32"><path fill="currentColor" d="M28 10v18H10V10h18m0-2H10a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Z" /><path fill="currentColor" d="M4 18H2V4a2 2 0 0 1 2-2h14v2H4Z" /></svg>
      <div class="group-hover/copy:op-100 gpt-copy-tips">复制</div>
    </div>
    ${rawCode}
  </div>`
}

const renderMarkdown = (content: Accessor<string> | string) => {
  if (typeof content === 'function')
    return md.render(content() || '')
  else if (typeof content === 'string')
    return md.render(content)

  return ''
}

// 流式期间的轻量渲染：仅转义 HTML 并把换行转为 <br>（与 md 的 breaks:true 行为一致），
// 不跑 markdown / highlight.js / katex，避免每个 chunk 全量重排导致的 O(n²) 卡顿。
// 流结束后该条消息以新实例进入列表，自然走完整 renderMarkdown。
const renderLight = (content: Accessor<string> | string) => {
  const text = typeof content === 'function' ? content() : content
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

interface Props {
  role: ChatMessage['role']
  message: Accessor<string> | string
  thinkMessage: Accessor<string> | string
  toolMessage?: Accessor<string> | string
  attachments?: ChatMessage['attachments']
  showRetry?: Accessor<boolean>
  onRetry?: () => void
  showExportMenu?: Accessor<boolean>
  onToggleExportMenu?: (e: MouseEvent) => void
  onExport?: (format: 'markdown' | 'json' | 'text') => void
  onDeleteMessage?: () => void
  onEditMessage?: (newContent: string) => void
  animate?: boolean
  // 流式期间为真：正文/think/tool 走轻量渲染，避免逐 chunk 全量 markdown 重排
  streaming?: boolean
}

export default ({
  role,
  message,
  thinkMessage,
  toolMessage,
  attachments,
  showRetry,
  onRetry,
  showExportMenu,
  onToggleExportMenu,
  onExport,
  onDeleteMessage,
  onEditMessage,
  animate,
  streaming,
}: Props) => {
  const isUserMessage = role === 'user'
  // 仅在组件创建时读取一次 animate，避免后续 prop 变化导致已挂载的旧消息补播动画
  const shouldAnimate = animate
  const [isEditing, setIsEditing] = createSignal(false)
  const [editContent, setEditContent] = createSignal('')

  // 复制代码块：仅更新被点击按钮的 tooltip 文案，不触发整条消息重渲染，也不影响同消息其它代码块。
  const copyCode = async(code: string, btn: HTMLElement) => {
    try {
      await navigator.clipboard.writeText(code)
      const tip = btn.querySelector('.gpt-copy-tips')
      if (tip) {
        tip.textContent = '已复制'
        setTimeout(() => { tip.textContent = '复制' }, 1000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Copy entire message content
  const copyMessage = async() => {
    try {
      const content = typeof message === 'function' ? message() : message
      await navigator.clipboard.writeText(content || '')
    } catch (err) {
      console.error('Failed to copy message:', err)
    }
  }

  // Start editing message
  const startEdit = () => {
    const content = typeof message === 'function' ? message() : message
    setEditContent(content || '')
    setIsEditing(true)
  }

  // Confirm edit and trigger regeneration
  const confirmEdit = () => {
    const newContent = editContent().trim()
    if (newContent && onEditMessage)
      onEditMessage(newContent)

    setIsEditing(false)
  }

  // Cancel editing
  const cancelEdit = () => {
    setIsEditing(false)
    setEditContent('')
  }

  // Handle keyboard events in edit textarea
  const handleEditKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey) return
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const htmlString = () => streaming ? renderLight(message) : renderMarkdown(message)
  const thinkHtmlString = () => streaming ? renderLight(thinkMessage) : renderMarkdown(thinkMessage)
  const toolHtmlString = () => {
    if (!toolMessage) return ''
    return streaming ? renderLight(toolMessage) : renderMarkdown(toolMessage)
  }

  const hasToolMessage = () => {
    if (!toolMessage) return false
    const v = typeof toolMessage === 'function' ? toolMessage() : toolMessage
    return !!v && v !== ''
  }

  const handleCopyClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    const btn = (el.matches('div.copy-btn') ? el : el.closest('div.copy-btn')) as HTMLElement | null
    if (!btn) return

    const code = btn.dataset.code ? decodeURIComponent(btn.dataset.code) : null
    if (code)
      copyCode(code, btn)
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
    <div class={`md:py-2 md:px-4 transition-colors group${shouldAnimate ? ' message-enter' : ''}`}>
      <div class={`flex rounded-lg ${isUserMessage ? 'justify-end' : ''}`}>
        <div ref={messageRef!} class={`message prose break-words overflow-hidden ${isUserMessage ? `max-w-[85%] bg-slate/8 dark:bg-slate/15 rounded-2xl px-4 ${isEditing() ? ' w-[85%]' : ''}` : 'flex-1'}`}>
          <Show when={isEditing()}>
            <textarea
              ref={(el) => {
                // 设置初始值并自动调整高度
                el.value = editContent()
                setTimeout(() => {
                  el.style.height = 'auto'
                  el.style.height = `${el.scrollHeight}px`
                  el.focus()
                })
              }}
              onInput={(e) => {
                setEditContent(e.currentTarget.value)
                e.currentTarget.style.height = 'auto'
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
              }}
              onKeyDown={handleEditKeydown}
              class="w-full p-2 rounded-lg border border-slate/20 bg-[var(--c-bg)] text-[var(--c-fg)] resize-none focus:outline-none focus:border-slate/40 min-h-[4em]"
            />
            <div class="flex gap-2 mt-2 justify-end">
              <button onClick={cancelEdit} class="px-3 py-1 text-sm rounded-md border border-slate/20 text-gray-500 hover:bg-slate/10 transition-colors">
                取消
              </button>
              <button onClick={confirmEdit} class="px-3 py-1 text-sm rounded-md bg-(slate op-15) hover:bg-op-20 transition-colors">
                提交
              </button>
            </div>
          </Show>
          <Show when={!isEditing()}>
            {hasToolMessage() && (
              <details open={!onRetry}>
                <summary>🔍 联网搜索</summary>
                <div innerHTML={toolHtmlString()} />
              </details>
            )}
            {thinkMessage && (typeof thinkMessage === 'function' ? thinkMessage() !== '' : thinkMessage !== '') && (
              <details open={!onRetry}>
                <summary>{message && (typeof message === 'function' ? message() !== '' : message !== '') ? '思考过程' : '思考中...'}</summary>
                <div innerHTML={thinkHtmlString()} />
              </details>
            )}
            <div innerHTML={htmlString()} />

            {/* Show attachments if present */}
            <Show when={attachments && attachments.length > 0}>
              <FileAttachments attachments={attachments!} />
            </Show>
          </Show>
        </div>
      </div>
      {/* Message action buttons */}
      <Show when={!isEditing()}>
        <div class={`flex gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isUserMessage ? 'justify-end' : ''}`}>
          <button
            onClick={copyMessage}
            title="复制消息"
            class="inline-fcc w-6 h-6 rounded text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate/10 transition-colors"
          >
            <IconCopy />
          </button>
          {onDeleteMessage && (
            <button
              onClick={onDeleteMessage}
              title="删除消息"
              class="inline-fcc w-6 h-6 rounded text-sm text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red/10 transition-colors"
            >
              <IconDelete />
            </button>
          )}
          {isUserMessage && onEditMessage && (
            <button
              onClick={startEdit}
              title="编辑消息"
              class="inline-fcc w-6 h-6 rounded text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate/10 transition-colors"
            >
              <IconEdit />
            </button>
          )}
          <Show when={!isUserMessage && showRetry?.()}>
            <button
              onClick={onRetry}
              title="重新生成"
              class="inline-fcc w-6 h-6 rounded text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate/10 transition-colors"
            >
              <IconRefresh />
            </button>
          </Show>
          {/* 导出对话按钮，并入消息操作按钮组，仅保留图标 */}
          <Show when={showRetry?.() && onExport && onToggleExportMenu && showExportMenu}>
            <div class="relative inline-fcc">
              <button
                onClick={onToggleExportMenu}
                title="导出对话"
                class="inline-fcc w-6 h-6 rounded text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate/10 transition-colors"
              >
                <IconExport />
              </button>
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
        </div>
      </Show>
    </div>
  )
}
