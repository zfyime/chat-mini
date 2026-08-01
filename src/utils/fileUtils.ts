import { CONFIG } from '@/config/constants'
import { extractDocumentText, isExtractableDocument } from './documentExtract'
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

// 某些浏览器不会为部分文本文件提供 MIME 类型，按扩展名兜底
const resolveFileType = (file: File): string => {
  if (file.type)
    return file.type

  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension)
    return ''

  return EXTENSION_TYPE_MAP[extension] ?? ''
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

  // 文档类会在客户端解析成纯文本，与文本文件共用大限制；图片单独限制
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

// 图片压缩：长边超过 IMAGE_MAX_DIMENSION 时按比例缩小并重编码为 JPEG，
// 减少请求体积和 vision 接口按分辨率切 tile 的数量。
// GIF 保留动画不处理；小尺寸小体积、或重编码后反而更大的图返回 null（调用方走原始 base64）。
const IMAGE_MAX_DIMENSION = 1568
const IMAGE_COMPRESS_QUALITY = 0.85
const IMAGE_COMPRESS_MIN_SIZE = 512 * 1024 // 小于 512KB 且尺寸达标的图不重编码

const compressImage = async(file: File): Promise<{ content: string, type: string } | null> => {
  if (file.type === 'image/gif')
    return null

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= IMAGE_COMPRESS_MIN_SIZE) {
    bitmap.close()
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  // JPEG 兼容性最好（Safari 不支持 canvas 编码 WebP），透明背景会变白/黑，可接受
  const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_COMPRESS_QUALITY)
  const base64 = dataUrl.split(',')[1]

  // 重编码可能反向膨胀（原图本身是高压缩 JPEG 时），此时返回 null 让调用方用原图
  // base64 长度 * 0.75 ≈ 编码前字节数
  if (base64.length * 0.75 >= file.size)
    return null

  return { content: base64, type: 'image/jpeg' }
}

export const createFileAttachment = async(file: File): Promise<FileAttachment> => {
  const validation = validateFile(file)
  if (!validation.valid)
    throw new Error(validation.error)

  const fileType = resolveFileType(file)
  const isImage = CONFIG.ALLOWED_IMAGE_TYPES.includes(fileType as typeof CONFIG.ALLOWED_IMAGE_TYPES[number])
  let content: string
  let type = fileType
  let url: string | undefined
  let encoding: 'base64' | 'text'

  if (isImage) {
    // 先尝试压缩，压缩失败或无需压缩时回退到原图 base64
    const compressed = await compressImage(file).catch(() => null)
    if (compressed) {
      content = compressed.content
      type = compressed.type
    } else {
      content = await readFileAsBase64(file)
    }
    url = URL.createObjectURL(file) // For preview
    encoding = 'base64'
  } else if (isExtractableDocument(fileType)) {
    // PDF / Word 解析成纯文本，避免 base64 浪费 token 且模型无法解读
    content = await extractDocumentText(file, fileType)
    encoding = 'text'
  } else {
    content = await readFileAsText(file)
    encoding = 'text'
  }

  return {
    id: generateFileId(),
    name: file.name,
    type,
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
