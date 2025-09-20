import { createSignal } from 'solid-js'
import { createFileAttachment, validateFile } from '@/utils/fileUtils'
import IconAttachment from './icons/Attachment'
import type { FileAttachment } from '@/types'

interface Props {
  onFilesSelected: (files: FileAttachment[]) => void
  disabled?: boolean
}

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

        const attachment = await createFileAttachment(file)
        attachments.push(attachment)
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`)
      }
    }

    if (errors.length > 0) {
      // Replace alert with a more user-friendly notification
      // For now, keep alert but consider implementing a toast notification system
      // eslint-disable-next-line no-alert
      alert(`文件处理失败:\n${errors.join('\n')}`)
    }

    if (attachments.length > 0)
      onFilesSelected(attachments)

    setIsUploading(false)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled())
      setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled() || !e.dataTransfer?.files) return
    handleFiles(e.dataTransfer.files)
  }

  const handleFileSelect = () => {
    if (disabled()) return
    fileInputRef.click()
  }

  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      handleFiles(target.files)
      target.value = '' // Reset input
    }
  }

  return (
    <div class="file-upload-container">
      {/* Hidden file input */}
      <input
        ref={fileInputRef!}
        type="file"
        multiple
        class="hidden"
        accept={[
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'text/plain',
          'text/markdown',
          '.md',
          '.txt',
        ].join(',')}
        onChange={handleInputChange}
      />

      {/* Upload button */}
      <button
        onClick={handleFileSelect}
        disabled={disabled() || isUploading()}
        class="gen-slate-btn fcc rounded-lg"
        title="上传文件"
      >
        <IconAttachment />
        {isUploading() && <span class="ml-1 text-xs">上传中...</span>}
      </button>

      {/* Drag and drop area (when files are being dragged) */}
      {isDragOver() && (
        <div
          class="fixed inset-0 bg-slate/20 backdrop-blur-sm fcc z-50 border-2 border-dashed border-slate"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div class="bg-$c-bg p-8 rounded-lg shadow-lg text-center border border-slate/20">
            <IconAttachment class="text-4xl mx-auto mb-4 text-slate" />
            <p class="text-lg font-medium">释放文件以上传</p>
            <p class="text-sm op-70">支持图片、PDF、文本文件</p>
          </div>
        </div>
      )}

      {/* Global drag listeners */}
      <div
        class="fixed inset-0 pointer-events-none"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
    </div>
  )
}
