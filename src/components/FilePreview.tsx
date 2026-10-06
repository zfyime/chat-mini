import { For, Show } from 'solid-js'
import { formatFileSize, getFileIcon } from '@/utils/fileUtils'
import type { FileAttachment } from '@/types'

interface Props {
  files: FileAttachment[]
  onRemoveFile: (fileId: string) => void
  onClearAll: () => void
}

// 不解构 props：Solid 组件体只执行一次，解构会立即求值而丢失 props 响应性，
// files 后续变化就不会更新。同理用 <Show> 替代 early return，空列表时整体不渲染。
export default (props: Props) => (
  <Show when={props.files.length > 0}>
    <div class="mb-4 p-3 bg-slate/10 rounded-lg">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-slate">已选择文件 ({props.files.length})</span>
        <button
          onClick={props.onClearAll}
          class="text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded hover:bg-red-50"
        >
          清除全部
        </button>
      </div>
      <div class="space-y-2">
        <For each={props.files}>
          {file => (
            <div class="flex items-center gap-3 p-3 bg-slate/5 border border-slate/10 rounded-lg transition-colors hover:bg-slate/10">
              <span class="text-2xl flex-shrink-0">{getFileIcon(file.type, file.name)}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{file.name}</div>
                <div class="text-xs text-slate/70">{formatFileSize(file.size)}</div>
              </div>
              <button
                onClick={() => props.onRemoveFile(file.id)}
                class="flex items-center justify-center w-6 h-6 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                title="移除文件"
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  </Show>
)
