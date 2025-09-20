import { For, Show } from 'solid-js'
import { formatFileSize, getFileIcon, isImageFile } from '@/utils/fileUtils'
import type { FileAttachment } from '@/types'

interface Props {
  attachments: FileAttachment[]
}

export default ({ attachments }: Props) => {
  const downloadFile = (attachment: FileAttachment) => {
    if (isImageFile(attachment.type)) {
      // For images, open in a new tab
      if (attachment.url)
        window.open(attachment.url, '_blank')

      return
    }

    // For text files, create a download link
    const blob = new Blob([attachment.content], { type: attachment.type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = attachment.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div class="file-attachments mt-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <For each={attachments}>
          {attachment => (
            <div class="p-3 bg-slate/10 border border-slate/20 rounded-sm transition-colors hover:bg-slate/15">
              <Show
                when={isImageFile(attachment.type)}
                fallback={
                  <div class="fi gap-3">
                    <span class="text-2xl flex-shrink-0">{getFileIcon(attachment.type)}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{attachment.name}</p>
                      <p class="text-xs op-70">{formatFileSize(attachment.size)}</p>
                    </div>
                    <button
                      onClick={() => downloadFile(attachment)}
                      class="text-sm text-slate hover:op-80 transition-opacity flex-shrink-0"
                    >
                      查看
                    </button>
                  </div>
                }
              >
                <div class="space-y-2">
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    class="w-full max-h-48 object-cover rounded-sm cursor-pointer border border-slate/20"
                    onClick={() => downloadFile(attachment)}
                  />
                  <div class="fi gap-2">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{attachment.name}</p>
                      <p class="text-xs op-70">{formatFileSize(attachment.size)}</p>
                    </div>
                    <button
                      onClick={() => downloadFile(attachment)}
                      class="text-sm text-slate hover:op-80 transition-opacity flex-shrink-0"
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
