import { FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'

/**
 * Whitelist de MIME types permitidos
 * Adicione mais tipos conforme necessário
 */
const ALLOWED_MIME_TYPES = {
  // Imagens
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],

  // Vídeos
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],

  // Áudio
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],

  // Documentos
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/zip': ['.zip'],
} as const

/**
 * Limites de tamanho por tipo de arquivo (em bytes)
 */
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB para imagens
  video: 100 * 1024 * 1024, // 100MB para vídeos
  audio: 25 * 1024 * 1024, // 25MB para áudio
  document: 20 * 1024 * 1024, // 20MB para documentos
} as const

/**
 * Sanitiza o nome do arquivo removendo caracteres perigosos
 * e prevenindo path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove qualquer diretório do caminho (path traversal protection)
  const basename = path.basename(filename)

  // Remove caracteres especiais perigosos, mantém apenas:
  // - Letras (a-z, A-Z)
  // - Números (0-9)
  // - Hífens, underscores e pontos
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Remove múltiplos pontos consecutivos (prevent ../../../)
  const noDots = sanitized.replace(/\.{2,}/g, '.')

  // Limita o tamanho do nome do arquivo
  const maxLength = 255
  if (noDots.length > maxLength) {
    const ext = path.extname(noDots)
    const name = path.basename(noDots, ext)
    return name.substring(0, maxLength - ext.length) + ext
  }

  return noDots
}

/**
 * Valida o tipo MIME do arquivo contra a whitelist
 */
export function validateMimeType(mimeType: string, extension: string): boolean {
  const allowedExtensions = ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES]
  if (!allowedExtensions) {
    return false
  }

  // Verifica se a extensão corresponde ao MIME type
  return allowedExtensions.includes(extension.toLowerCase())
}

/**
 * Determina a categoria do arquivo baseado no MIME type
 */
export function getFileCategory(mimeType: string): keyof typeof FILE_SIZE_LIMITS {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

/**
 * Valida o tamanho do arquivo baseado em sua categoria
 */
export function validateFileSize(size: number, category: keyof typeof FILE_SIZE_LIMITS): boolean {
  const maxSize = FILE_SIZE_LIMITS[category]
  return size <= maxSize
}

/**
 * Middleware para validar uploads de arquivos
 * Deve ser usado em rotas que aceitam uploads
 */
export async function validateFileUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await request.file()

    if (!data) {
      return reply.status(400).send({
        message: 'Nenhum arquivo fornecido',
        success: false,
      })
    }

    // Valida MIME type
    const mimeType = data.mimetype
    const extension = path.extname(data.filename)

    if (!validateMimeType(mimeType, extension)) {
      return reply.status(400).send({
        message: `Tipo de arquivo não permitido. MIME type: ${mimeType}, Extensão: ${extension}`,
        success: false,
        allowedTypes: Object.keys(ALLOWED_MIME_TYPES),
      })
    }

    // Valida tamanho do arquivo
    const buffer = await data.toBuffer()
    const fileSize = buffer.length
    const category = getFileCategory(mimeType)

    if (!validateFileSize(fileSize, category)) {
      return reply.status(400).send({
        message: `Arquivo muito grande. Tamanho máximo para ${category}: ${FILE_SIZE_LIMITS[category] / (1024 * 1024)}MB`,
        success: false,
      })
    }

    // Sanitiza o nome do arquivo
    const sanitizedFilename = sanitizeFilename(data.filename)

    // Armazena informações do arquivo na requisição para uso posterior
    ;(request as any).fileData = {
      filename: sanitizedFilename,
      originalFilename: data.filename,
      mimetype: mimeType,
      buffer: buffer,
      size: fileSize,
      category: category,
    }
  } catch (error: any) {
    return reply.status(500).send({
      message: 'Erro ao validar arquivo',
      success: false,
    })
  }
}

/**
 * Middleware específico para validar uploads de áudio (feedbacks)
 */
export async function validateAudioUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await request.file()

    if (!data) {
      return reply.status(400).send({
        message: 'Nenhum arquivo de áudio fornecido',
        success: false,
      })
    }

    // Valida que é um arquivo de áudio
    const mimeType = data.mimetype
    if (!mimeType.startsWith('audio/')) {
      return reply.status(400).send({
        message: 'O arquivo deve ser de áudio',
        success: false,
        receivedType: mimeType,
      })
    }

    const extension = path.extname(data.filename)
    if (!validateMimeType(mimeType, extension)) {
      return reply.status(400).send({
        message: `Formato de áudio não suportado: ${extension}`,
        success: false,
        supportedFormats: ['.mp3', '.wav', '.webm', '.ogg', '.m4a'],
      })
    }

    // Valida tamanho (25MB para áudio)
    const buffer = await data.toBuffer()
    const fileSize = buffer.length
    const maxSize = FILE_SIZE_LIMITS.audio

    if (fileSize > maxSize) {
      return reply.status(400).send({
        message: `Arquivo de áudio muito grande. Tamanho máximo: ${maxSize / (1024 * 1024)}MB`,
        success: false,
        receivedSize: `${(fileSize / (1024 * 1024)).toFixed(2)}MB`,
      })
    }

    // Sanitiza o nome do arquivo
    const sanitizedFilename = sanitizeFilename(data.filename)

    // Armazena informações do arquivo na requisição
    ;(request as any).audioData = {
      filename: sanitizedFilename,
      originalFilename: data.filename,
      mimetype: mimeType,
      buffer: buffer,
      size: fileSize,
    }
  } catch (error: any) {
    return reply.status(500).send({
      message: 'Erro ao validar arquivo de áudio',
      success: false,
    })
  }
}
