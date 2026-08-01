// PDF / Word 客户端文本提取：把二进制文档解析成纯文本再发给模型，
// 避免 base64 塞进 prompt 造成 token 浪费（模型也读不懂 base64）。
// 解析库体积较大，全部走动态 import，按需加载不影响首屏。

const extractPdfText = async(file: File): Promise<string> => {
  const pdfjs = await import('pdfjs-dist')
  // Vite 会把 worker 打包成独立资源
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  // finally 保证解析中途出错（加密/损坏 PDF）时也释放文档与 worker 内存
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
      pages.push(pageText)
    }

    const text = pages.join('\n\n').trim()
    if (!text)
      throw new Error(`${file.name} 无可提取文本（可能是扫描版 PDF）`)
    return text
  } finally {
    doc.destroy()
  }
}

const extractDocxText = async(file: File): Promise<string> => {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const text = result.value.trim()
  if (!text)
    throw new Error(`${file.name} 未提取到文本内容`)
  return text
}

// 按 MIME 类型分发；旧版 .doc 无浏览器端解析方案，明确报错引导用户转格式
export const extractDocumentText = async(file: File, fileType: string): Promise<string> => {
  if (fileType === 'application/pdf')
    return extractPdfText(file)
  if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return extractDocxText(file)
  if (fileType === 'application/msword')
    throw new Error('旧版 .doc 格式不支持解析，请另存为 .docx 后重新上传')
  throw new Error(`不支持解析的文档类型: ${fileType}`)
}

export const isExtractableDocument = (fileType: string): boolean => {
  return [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(fileType)
}
