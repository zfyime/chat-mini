import { For } from 'solid-js'
import { formatFileSize, getFileIcon } from '@/utils/fileUtils'
import type { FileAttachment } from '@/types'

interface Props {
  files: FileAttachment[]
  onRemoveFile: (fileId: string) => void
  onClearAll: () => void
}

export default ({ files, onRemoveFile, onClearAll }: Props) => {
  if (files.length === 0) return null

  return (
    <div class="mb-3 p-2 bg-slate/10 rounded-lg border border-slate/20">
      <div class="fb mb-2">
        <span class="text-sm font-medium">已选择文件 ({files.length})</span>
        <button
          onClick={onClearAll}
          class="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          清除全部
        </button>
      </div>
      <div class="space-y-1">
        <For each={files}>
          {file => (
            <div class="fi p-2 bg-$c-bg rounded-lg text-sm border border-slate/10 gap-2">
              <span class="text-lg flex-shrink-0">{getFileIcon(file.type)}</span>
              <div class="flex-1 min-w-0">
                <div class="truncate font-medium">{file.name}</div>
                <div class="op-70 text-xs">{formatFileSize(file.size)}</div>
              </div>
              <button
                onClick={() => onRemoveFile(file.id)}
                class="text-red-500 hover:text-red-700 p-1 transition-colors flex-shrink-0"
                title="移除"
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
