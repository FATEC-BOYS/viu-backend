/**
 * Limites de upload — fonte única.
 *
 * Antes o número vivia em três lugares que discordavam entre si: o
 * `@fastify/multipart` cortava em 25 MB, `FILE_SIZE_LIMITS.video` prometia
 * 100 MB, e o frontend validava contra 100 MB copiados na mão. O resultado é
 * que um vídeo de 40 MB passava na validação do navegador, era cortado pelo
 * multipart antes de chegar ao middleware, e a pessoa recebia um erro genérico
 * em vez da mensagem que explica o que houve.
 *
 * Aqui os três passam a ler o mesmo lugar, e o teto absoluto é explícito.
 */

/**
 * Teto do `@fastify/multipart`. Nenhum upload passa disto, seja qual for a
 * categoria — o plugin corta o stream antes de qualquer código nosso rodar.
 *
 * O valor é limitado pela memória, não por gosto: `data.toBuffer()` carrega o
 * arquivo inteiro na RAM antes de validar e mandar para o R2. Subir este
 * número multiplica o consumo por upload simultâneo, então mexer nele pede
 * upload em streaming antes.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  document: 20 * 1024 * 1024,
} as const

export type CategoriaUpload = keyof typeof FILE_SIZE_LIMITS

export const ALLOWED_MIME_TYPES = {
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

/**
 * O que de fato passa para uma categoria.
 *
 * `FILE_SIZE_LIMITS.video` diz 100 MB, mas o multipart corta em 25 MB muito
 * antes — então o limite real é o menor dos dois. Quem informa um número ao
 * usuário precisa informar este, não a promessa.
 */
export function limiteEfetivo(categoria: CategoriaUpload): number {
  return Math.min(FILE_SIZE_LIMITS[categoria], MAX_UPLOAD_BYTES)
}

/** Todos os limites efetivos, no formato que a API expõe ao frontend. */
export function limitesEfetivos(): Record<CategoriaUpload, number> {
  const saida = {} as Record<CategoriaUpload, number>
  for (const categoria of Object.keys(FILE_SIZE_LIMITS) as CategoriaUpload[]) {
    saida[categoria] = limiteEfetivo(categoria)
  }
  return saida
}
