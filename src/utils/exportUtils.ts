import type { ChatMessage } from '@/types'

/**
 * 导出对话为 Markdown 格式
 */
export const exportToMarkdown = (messages: ChatMessage[], systemRole: string = '') => {
  let markdown = '# 对话记录\n\n'
  const exportTime = new Date().toLocaleString('zh-CN')
  markdown += `> 导出时间: ${exportTime}\n\n`

  // 添加系统角色设定
  if (systemRole) {
    markdown += '## 系统设定\n\n'
    markdown += `${systemRole}\n\n`
    markdown += '---\n\n'
  }

  // 添加对话内容
  markdown += '## 对话内容\n\n'
  messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? '👤 **用户**' : msg.role === 'assistant' ? '🤖 **助手**' : '⚙️ **系统**'

    markdown += `### ${role}\n\n`

    // 主要内容
    if (msg.content) {
      markdown += `${msg.content}\n\n`
    }

    // 思考过程（如果有）
    if (msg.think) {
      markdown += '<details>\n'
      markdown += '<summary>💭 思考过程</summary>\n\n'
      markdown += `${msg.think}\n\n`
      markdown += '</details>\n\n'
    }

    // 附件信息（如果有）
    if (msg.attachments && msg.attachments.length > 0) {
      markdown += '📎 **附件:**\n'
      msg.attachments.forEach((att) => {
        const sizeInKB = (att.size / 1024).toFixed(2)
        const encodingLabel = att.encoding === 'base64' ? '，Base64' : ''
        markdown += `- ${att.name} (${sizeInKB} KB${encodingLabel})\n`
      })
      markdown += '\n'
    }

    // 添加分隔线（除了最后一条消息）
    if (index < messages.length - 1) {
      markdown += '---\n\n'
    }
  })

  return markdown
}

/**
 * 导出对话为 JSON 格式
 */
export const exportToJSON = (messages: ChatMessage[], systemRole: string = '') => {
  const exportData = {
    exportTime: new Date().toISOString(),
    exportTimeLocal: new Date().toLocaleString('zh-CN'),
    systemRole,
    messageCount: messages.length,
    messages: messages.map((msg) => ({
      ...msg,
      // 清理附件中的 Base64 内容以减小文件大小（可选）
      attachments: msg.attachments?.map(att => ({
        id: att.id,
        name: att.name,
        type: att.type,
        size: att.size,
        encoding: att.encoding,
        // 不导出 content 和 url，以减小文件大小
        hasContent: !!att.content,
      })),
    })),
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * 导出对话为纯文本格式
 */
export const exportToText = (messages: ChatMessage[], systemRole: string = '') => {
  let text = '=== 对话记录 ===\n\n'
  text += `导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`

  if (systemRole) {
    text += '=== 系统设定 ===\n'
    text += `${systemRole}\n\n`
    text += '=' .repeat(50) + '\n\n'
  }

  messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '系统'

    text += `[${role}]:\n`
    if (msg.content) {
      text += `${msg.content}\n`
    }

    if (msg.think) {
      text += `\n[思考过程]:\n${msg.think}\n`
    }

    if (msg.attachments && msg.attachments.length > 0) {
      text += '\n[附件]: '
      text += msg.attachments.map(att => att.encoding === 'base64' ? `${att.name}(Base64)` : att.name).join(', ')
      text += '\n'
    }

    text += '\n' + '-'.repeat(50) + '\n\n'
  })

  return text
}

/**
 * 下载文件到本地
 */
export const downloadFile = (filename: string, content: string, mimeType: string = 'text/plain') => {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename

    // 添加到 DOM 并触发点击
    document.body.appendChild(link)
    link.click()

    // 清理
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  } catch (error) {
    console.error('下载文件失败:', error)
    // 降级处理：打开新窗口显示内容
    const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`
    window.open(dataUrl, '_blank')
  }
}

/**
 * 生成文件名
 */
export const generateFilename = (format: 'md' | 'json' | 'txt') => {
  const now = new Date()
  const timestamp = now.toISOString().slice(0, 19).replace(/[:\s]/g, '-')
  return `chat-export-${timestamp}.${format}`
}

/**
 * 导出对话的主函数
 */
export const exportChat = (
  messages: ChatMessage[],
  systemRole: string = '',
  format: 'markdown' | 'json' | 'text' = 'markdown',
) => {
  let content: string
  let filename: string
  let mimeType: string

  switch (format) {
    case 'json':
      content = exportToJSON(messages, systemRole)
      filename = generateFilename('json')
      mimeType = 'application/json'
      break
    case 'text':
      content = exportToText(messages, systemRole)
      filename = generateFilename('txt')
      mimeType = 'text/plain'
      break
    case 'markdown':
    default:
      content = exportToMarkdown(messages, systemRole)
      filename = generateFilename('md')
      mimeType = 'text/markdown'
      break
  }

  downloadFile(filename, content, mimeType)

  // 返回导出信息，用于显示成功提示等
  return {
    filename,
    format,
    messageCount: messages.length,
    size: new Blob([content]).size,
  }
}
