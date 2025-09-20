import { createSignal } from 'solid-js'
import { createFileAttachment, validateFile } from '@/utils/fileUtils'
import IconAttachment from './icons/Attachment'
import type { FileAttachment } from '@/types'

interface Props {
  onFilesSelected: (files: FileAttachment[]) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,.md,.txt'

export default ({ onFilesSelected, disabled }: Props) => {
  const [isDragOver, setIsDragOver] = createSignal(false)
  const [isUploading, setIsUploading] = createSignal(false)
  let fileInputRef: HTMLInputElement

  const handleFiles = async(files: FileList) => {
    if (disabled() || isUploading()) return

    setIsUploading(true)
    const attachments: FileAttachment[] = []
    const errors: string[] = []

    for (const file of Array.from(files)) {
      try {
        const validation = validateFile(file)
        if (!validation.valid) {
          errors.push(`${file.name}: ${validation.error}`)
          continue
        }
        attachments.push(await createFileAttachment(file))
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`)
      }
    }

    if (errors.length > 0) {
      // eslint-disable-next-line no-alert
      alert(`文件处理失败:\n${errors.join('\n')}`)
    }

    if (attachments.length > 0)
      onFilesSelected(attachments)

    setIsUploading(false)
  }

  const handleDragEvent = (e: DragEvent, isDragging?: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    if (isDragging !== undefined)
      setIsDragOver(isDragging && !disabled())
  }

  const handleDrop = (e: DragEvent) => {
    handleDragEvent(e, false)
    if (!disabled() && e.dataTransfer?.files)
      handleFiles(e.dataTransfer.files)
  }

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    if (target.files?.length) {
      handleFiles(target.files)
      target.value = ''
    }
  }

  return (
    <div class="file-upload-container">
      <input
        ref={fileInputRef!}
        type="file"
        multiple
        class="hidden"
        accept={ACCEPTED_TYPES}
        onChange={handleInputChange}
      />

      <button
        onClick={() => !disabled() && fileInputRef.click()}
        disabled={disabled() || isUploading()}
        class="gen-slate-btn fcc rounded-lg"
        title="上传文件"
      >
        <IconAttachment />
        {isUploading() && <span class="ml-1 text-xs">上传中...</span>}
      </button>

      {isDragOver() && (
        <div
          class="fixed inset-0 bg-slate/20 backdrop-blur-sm fcc z-50 border-2 border-dashed border-slate"
          onDragOver={e => handleDragEvent(e, true)}
          onDragLeave={e => handleDragEvent(e, false)}
          onDrop={handleDrop}
        >
          <div class="bg-$c-bg p-8 rounded-lg shadow-lg text-center border border-slate/20">
            <IconAttachment class="text-4xl mx-auto mb-4 text-slate" />
            <p class="text-lg font-medium">释放文件以上传</p>
            <p class="text-sm op-70">支持图片、PDF、文本文件</p>
          </div>
        </div>
      )}

      <div
        class="fixed inset-0 pointer-events-none"
        onDragOver={e => handleDragEvent(e, true)}
        onDragLeave={e => handleDragEvent(e, false)}
        onDrop={handleDrop}
      />
    </div>
  )
}
