import { For, Show, createSignal } from 'solid-js'
import { formatFileSize, getFileIcon, isImageFile } from '@/utils/fileUtils'
import type { FileAttachment } from '@/types'

interface Props {
  attachments: FileAttachment[]
}

export default ({ attachments }: Props) => {
  const [previewAttachment, setPreviewAttachment] = createSignal<FileAttachment | null>(null)

  const createBlobFromAttachment = (attachment: FileAttachment) => {
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

  const getImagePreviewUrl = (attachment: FileAttachment) => {
    if (attachment.url)
      return attachment.url

    if (attachment.encoding === 'base64' && attachment.content) {
      const mimeType = attachment.type || 'application/octet-stream'
      return `data:${mimeType};base64,${attachment.content}`
    }

    return null
  }

  const triggerDownload = (attachment: FileAttachment) => {
    const blob = createBlobFromAttachment(attachment)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    Object.assign(a, { href: url, download: attachment.name })
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleViewAttachment = (attachment: FileAttachment) => {
    if (isImageFile(attachment.type)) {
      const imageUrl = getImagePreviewUrl(attachment)
      if (imageUrl) {
        setPreviewAttachment(attachment)
      } else {
        triggerDownload(attachment)
      }
      return
    }

    triggerDownload(attachment)
  }

  const closePreview = () => setPreviewAttachment(null)

  const previewImageUrl = () => {
    const attachment = previewAttachment()
    if (!attachment)
      return null
    return getImagePreviewUrl(attachment)
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
                      onClick={() => handleViewAttachment(attachment)}
                      class="text-xs text-slate hover:text-slate/80 transition-colors px-2 py-1 rounded hover:bg-slate/10 flex-shrink-0"
                    >
                      查看
                    </button>
                  </div>
                }
              >
                <div class="space-y-3">
                  <img
                    src={getImagePreviewUrl(attachment)}
                    alt={attachment.name}
                    class="w-full max-h-48 object-cover rounded-lg cursor-pointer border border-slate/20"
                    onClick={() => handleViewAttachment(attachment)}
                  />
                  <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{attachment.name}</p>
                      <p class="text-xs text-slate/70">{formatFileSize(attachment.size)}</p>
                    </div>
                    <button
                      onClick={() => handleViewAttachment(attachment)}
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

      <Show when={previewAttachment()}>
        <div
          class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={closePreview}
        >
          <div class="relative max-w-3xl w-full" onClick={event => event.stopPropagation()}>
            <button
              onClick={closePreview}
              class="absolute -top-10 right-0 text-sm text-white/80 hover:text-white transition-colors"
            >
              关闭
            </button>
            <Show when={previewImageUrl()}>
              {url => (
                <img
                  src={url()}
                  alt={previewAttachment()!.name}
                  class="w-full max-h-[75vh] object-contain rounded-lg border border-white/20"
                />
              )}
            </Show>
            <div class="mt-3 flex items-center justify-between text-xs text-white/80">
              <span class="truncate">{previewAttachment()!.name}</span>
              <div class="flex items-center gap-3">
                <span>{formatFileSize(previewAttachment()!.size)}</span>
                <button
                  onClick={() => {
                    if (previewAttachment())
                      triggerDownload(previewAttachment()!)
                  }}
                  class="underline hover:no-underline"
                >
                  下载
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
