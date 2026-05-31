import { CONFIG } from '@/config/constants'
import type { FileAttachment } from '@/types'

const EXTENSION_TYPE_MAP: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  log: 'text/plain',
  js: 'text/javascript',
  html: 'text/html',
  css: 'text/css',
  php: 'text/x-php',
  go: 'text/x-go',
  py: 'text/x-python',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  cs: 'text/x-csharp',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
}

const TEXTUAL_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/xml',
  'application/yaml',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/javascript',
  'application/php',
  'application/x-httpd-php',
  'application/x-go',
  'application/x-python',
  'application/x-java',
  'application/x-c',
  'application/x-c++',
  'application/x-csharp',
  'application/x-log',
])

// 某些浏览器不会为部分文本文件提供 MIME 类型，按扩展名兜底
const resolveFileType = (file: File): string => {
  if (file.type)
    return file.type

  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension)
    return ''

  return EXTENSION_TYPE_MAP[extension] ?? ''
}

const isTextFileType = (fileType: string): boolean => {
  if (!fileType)
    return false
  if (fileType.startsWith('text/'))
    return true
  return TEXTUAL_MIME_TYPES.has(fileType)
}

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
  const fileType = resolveFileType(file)
  const isImage = CONFIG.ALLOWED_IMAGE_TYPES.includes(fileType as typeof CONFIG.ALLOWED_IMAGE_TYPES[number])
  const isDocument = CONFIG.ALLOWED_DOCUMENT_TYPES.includes(fileType as typeof CONFIG.ALLOWED_DOCUMENT_TYPES[number])

  if (!isImage && !isDocument) {
    const extension = file.name.split('.').pop()
    return {
      valid: false,
      error: `不支持的文件类型: ${fileType || `.${extension ?? 'unknown'}`}`,
    }
  }

  // 文本文件可直接读取，沿用大限制；图片次之；其余需 base64 编码的二进制文件控制内存峰值
  let maxSize: number
  if (isImage) maxSize = CONFIG.MAX_IMAGE_SIZE
  else if (isTextFileType(fileType)) maxSize = CONFIG.MAX_FILE_SIZE
  else maxSize = CONFIG.MAX_BINARY_FILE_SIZE

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

  const fileType = resolveFileType(file)
  const isImage = CONFIG.ALLOWED_IMAGE_TYPES.includes(fileType as typeof CONFIG.ALLOWED_IMAGE_TYPES[number])
  const isTextFile = isTextFileType(fileType)
  let content: string
  let url: string | undefined
  let encoding: 'base64' | 'text'

  if (isImage) {
    content = await readFileAsBase64(file)
    url = URL.createObjectURL(file) // For preview
    encoding = 'base64'
  } else if (isTextFile) {
    content = await readFileAsText(file)
    encoding = 'text'
  } else {
    content = await readFileAsBase64(file)
    encoding = 'base64'
  }

  return {
    id: generateFileId(),
    name: file.name,
    type: fileType,
    size: file.size,
    content,
    url,
    encoding,
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
