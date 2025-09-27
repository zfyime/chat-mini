import { For, Show } from 'solid-js'
import { formatFileSize, getFileIcon, isImageFile } from '@/utils/fileUtils'
import type { FileAttachment } from '@/types'

interface Props {
  attachments: FileAttachment[]
}

export default ({ attachments }: Props) => {
  const toBlob = (attachment: FileAttachment) => {
    const mimeType = attachment.type || 'application/octet-stream'

    if (attachment.encoding === 'base64' && typeof atob === 'function') {
      const binary = atob(attachment.content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mimeType })
    }

    return new Blob([attachment.content], { type: mimeType })
  }

  const resolveImageUrl = (attachment: FileAttachment) => {
    if (attachment.url && !attachment.url.startsWith('blob:'))
      return attachment.url

    if (attachment.encoding === 'base64')
      return `data:${attachment.type};base64,${attachment.content}`

    return attachment.url
  }

  const downloadFile = (attachment: FileAttachment) => {
    if (isImageFile(attachment.type)) {
      const imageUrl = resolveImageUrl(attachment)
      if (imageUrl)
        window.open(imageUrl, '_blank')
      return
    }

    const blob = toBlob(attachment)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    Object.assign(a, { href: url, download: attachment.name })
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div class="file-attachments mt-4">
      <div class="grid grid-cols-1 gap-3">
        <For each={attachments}>
          {attachment => (
            <div class="p-3 bg-slate/10 border border-slate/15 rounded-lg transition-colors hover:bg-slate/12">
              <Show
                when={isImageFile(attachment.type)}
                fallback={
                  <div class="flex items-center gap-3">
                    <span class="text-2xl flex-shrink-0">{getFileIcon(attachment.type, attachment.name)}</span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium truncate">{attachment.name}</div>
                      <div class="text-xs text-slate/70">{formatFileSize(attachment.size)}</div>
                    </div>
                    <button
                      onClick={() => downloadFile(attachment)}
                      class="text-xs text-slate hover:text-slate/80 transition-colors px-2 py-1 rounded hover:bg-slate/10 flex-shrink-0"
                    >
                      查看
                    </button>
                  </div>
                }
              >
                <div class="space-y-3">
                  <img
                    src={resolveImageUrl(attachment)}
                    alt={attachment.name}
                    class="w-full max-h-48 object-cover rounded-lg cursor-pointer border border-slate/20"
                    onClick={() => downloadFile(attachment)}
                  />
                  <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{attachment.name}</p>
                      <p class="text-xs text-slate/70">{formatFileSize(attachment.size)}</p>
                    </div>
                    <button
                      onClick={() => downloadFile(attachment)}
                      class="text-xs text-slate hover:text-slate/80 transition-colors px-2 py-1 rounded hover:bg-slate/10 flex-shrink-0"
                    >
                      查看
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
