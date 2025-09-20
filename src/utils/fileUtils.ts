import { CONFIG } from '@/config/constants'
import type { FileAttachment } from '@/types'

export const generateFileId = (): string => {
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export const validateFile = (file: File): { valid: boolean, error?: string } => {
  const isImage = CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)
  const isDocument = CONFIG.ALLOWED_DOCUMENT_TYPES.includes(file.type)

  if (!isImage && !isDocument) {
    return {
      valid: false,
      error: `不支持的文件类型: ${file.type}`,
    }
  }

  const maxSize = isImage ? CONFIG.MAX_IMAGE_SIZE : CONFIG.MAX_FILE_SIZE
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `文件大小超出限制: ${formatFileSize(file.size)} > ${formatFileSize(maxSize)}`,
    }
  }

  return { valid: true }
}

export const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export const createFileAttachment = async(file: File): Promise<FileAttachment> => {
  const validation = validateFile(file)
  if (!validation.valid)
    throw new Error(validation.error)

  const isImage = CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)
  let content: string
  let url: string | undefined

  if (isImage) {
    content = await readFileAsBase64(file)
    url = URL.createObjectURL(file) // For preview
  } else {
    content = await readFileAsText(file)
  }

  return {
    id: generateFileId(),
    name: file.name,
    type: file.type,
    size: file.size,
    content,
    url,
  }
}

export const getFileIcon = (fileType: string, fileName?: string): string => {
  if (CONFIG.ALLOWED_IMAGE_TYPES.includes(fileType))
    return '🖼️'

  if (fileType === 'application/pdf')
    return '📄'

  // 根据文件扩展名判断代码文件类型
  const extension = fileName?.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return '📜'
    case 'html':
    case 'htm':
      return '🌐'
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return '🎨'
    case 'php':
      return '🐘'
    case 'go':
      return '🐹'
    case 'py':
    case 'python':
      return '🐍'
    case 'java':
      return '☕'
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
      return '⚙️'
    case 'cs':
      return '🔷'
    case 'json':
      return '📋'
    case 'xml':
      return '📰'
    case 'yaml':
    case 'yml':
      return '📝'
    case 'log':
      return '📊'
    case 'md':
    case 'markdown':
      return '📖'
    default:
      if (fileType.startsWith('text/'))
        return '📝'
      return '📎'
  }
}

export const isImageFile = (fileType: string): boolean => {
  return CONFIG.ALLOWED_IMAGE_TYPES.includes(fileType as typeof CONFIG.ALLOWED_IMAGE_TYPES[number])
}

// Clean up preview URLs to prevent memory leaks
export const cleanupFileUrl = (url?: string): void => {
  if (url && url.startsWith('blob:'))
    URL.revokeObjectURL(url)
}
