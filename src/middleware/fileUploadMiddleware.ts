import { FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'

const ALLOWED_MIME_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  // SVG removido: pode conter <script> e causar XSS no viewer
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/zip': ['.zip'],
} as const

const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  document: 20 * 1024 * 1024,
} as const

// Assinaturas de magic bytes para os tipos mais comuns
// Previne MIME spoofing: cliente declara image/jpeg mas envia outro tipo
const MAGIC_SIGNATURES: Record<string, string[]> = {
  'image/jpeg': ['ffd8ff'],
  'image/png': ['89504e47'],
  'image/gif': ['47494638'],
  'image/webp': ['52494646'],
  'application/pdf': ['25504446'],
  'audio/mpeg': ['494433', 'fffb', 'fff3', 'fff2'],
  'audio/wav': ['52494646'],
  'audio/ogg': ['4f676753'],
  'audio/webm': ['1a45dfa3'],
  'video/webm': ['1a45dfa3'],
}

function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_SIGNATURES[mimeType]
  if (!signatures) return true
  const hex = buffer.slice(0, 12).toString('hex')
  return signatures.some((sig) => hex.startsWith(sig))
}

export function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename)
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const noDots = sanitized.replace(/\.{2,}/g, '.')
  const maxLength = 255
  if (noDots.length > maxLength) {
    const ext = path.extname(noDots)
    const name = path.basename(noDots, ext)
    return name.substring(0, maxLength - ext.length) + ext
  }
  return noDots
}

export function validateMimeType(mimeType: string, extension: string): boolean {
  const allowedExtensions = ALLOWED_MIME_TYPES[mimeType as keyof typeof ALLOWED_MIME_TYPES]
  if (!allowedExtensions) return false
  return (allowedExtensions as readonly string[]).includes(extension.toLowerCase())
}

export function getFileCategory(mimeType: string): keyof typeof FILE_SIZE_LIMITS {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

export function validateFileSize(
  size: number,
  category: keyof typeof FILE_SIZE_LIMITS,
): boolean {
  return size <= FILE_SIZE_LIMITS[category]
}

export async function validateFileUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ message: 'Nenhum arquivo fornecido', success: false })
    }

    const mimeType = data.mimetype
    const extension = path.extname(data.filename)

    if (!validateMimeType(mimeType, extension)) {
      return reply.status(400).send({
        message: 'Tipo de arquivo não permitido',
        success: false,
        allowedTypes: Object.keys(ALLOWED_MIME_TYPES),
      })
    }

    const buffer = await data.toBuffer()
    const fileSize = buffer.length
    const category = getFileCategory(mimeType)

    if (!validateFileSize(fileSize, category)) {
      return reply.status(400).send({
        message: `Arquivo muito grande. Máximo para ${category}: ${FILE_SIZE_LIMITS[category] / (1024 * 1024)}MB`,
        success: false,
      })
    }

    if (!checkMagicBytes(buffer, mimeType)) {
      return reply.status(400).send({
        message: 'Conteúdo do arquivo não corresponde ao tipo declarado',
        success: false,
      })
    }

    const sanitizedFilename = sanitizeFilename(data.filename)
    ;(request as any).fileData = {
      filename: sanitizedFilename,
      originalFilename: data.filename,
      mimetype: mimeType,
      buffer,
      size: fileSize,
      category,
    }
  } catch (error: any) {
    return reply.status(500).send({ message: 'Erro ao validar arquivo', success: false })
  }
}

export async function validateAudioUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await request.file()
    if (!data) {
      return reply
        .status(400)
        .send({ message: 'Nenhum arquivo de áudio fornecido', success: false })
    }

    const mimeType = data.mimetype
    if (!mimeType.startsWith('audio/')) {
      return reply.status(400).send({
        message: 'O arquivo deve ser de áudio',
        success: false,
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

    // Captura campos do form ANTES de consumir o buffer (fields são parseados juntos)
    const fields = data.fields as Record<string, any> | undefined

    const buffer = await data.toBuffer()
    const fileSize = buffer.length
    const maxSize = FILE_SIZE_LIMITS.audio

    if (fileSize > maxSize) {
      return reply.status(400).send({
        message: `Áudio muito grande. Máximo: ${maxSize / (1024 * 1024)}MB`,
        success: false,
      })
    }

    if (!checkMagicBytes(buffer, mimeType)) {
      return reply.status(400).send({
        message: 'Conteúdo do arquivo não corresponde ao tipo de áudio declarado',
        success: false,
      })
    }

    const sanitizedFilename = sanitizeFilename(data.filename)
    ;(request as any).audioData = {
      filename: sanitizedFilename,
      originalFilename: data.filename,
      mimetype: mimeType,
      buffer,
      size: fileSize,
      // Campos do form armazenados aqui para o controller não precisar chamar request.file() novamente
      fields,
    }
  } catch (error: any) {
    return reply.status(500).send({ message: 'Erro ao validar arquivo de áudio', success: false })
  }
}

export async function validateArteUpload(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ message: 'Nenhum arquivo fornecido', success: false })
    }

    const mimeType = data.mimetype
    const extension = path.extname(data.filename)

    if (!validateMimeType(mimeType, extension)) {
      return reply.status(400).send({
        message: 'Tipo de arquivo não permitido',
        success: false,
        allowedTypes: Object.keys(ALLOWED_MIME_TYPES),
      })
    }

    // Captura campos do form antes de consumir o buffer
    const fields = data.fields as Record<string, any>

    const buffer = await data.toBuffer()
    const fileSize = buffer.length
    const category = getFileCategory(mimeType)

    if (!validateFileSize(fileSize, category)) {
      return reply.status(400).send({
        message: `Arquivo muito grande. Máximo para ${category}: ${FILE_SIZE_LIMITS[category] / (1024 * 1024)}MB`,
        success: false,
      })
    }

    if (!checkMagicBytes(buffer, mimeType)) {
      return reply.status(400).send({
        message: 'Conteúdo do arquivo não corresponde ao tipo declarado',
        success: false,
      })
    }

    const nome = fields.nome?.value?.trim()
    const projetoId = fields.projetoId?.value?.trim()
    if (!nome || !projetoId) {
      return reply.status(400).send({ message: 'nome e projetoId são obrigatórios', success: false })
    }

    ;(request as any).arteUploadData = {
      filename: sanitizeFilename(data.filename),
      mimetype: mimeType,
      buffer,
      size: fileSize,
      category,
      fields: {
        nome,
        descricao: fields.descricao?.value?.trim() || null,
        projetoId,
      },
    }
  } catch {
    return reply.status(500).send({ message: 'Erro ao validar arquivo da arte', success: false })
  }
}
