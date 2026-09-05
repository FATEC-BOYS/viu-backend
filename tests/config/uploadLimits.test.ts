/**
 * Limites de upload — o ponto é que exista um número só.
 *
 * O bug que estes testes travam: `FILE_SIZE_LIMITS.video` promete 100 MB, o
 * multipart corta em 25 MB, e quem informasse 100 MB ao usuário estaria
 * mentindo. `limiteEfetivo` existe para que ninguém precise lembrar disso.
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_UPLOAD_BYTES,
  FILE_SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
  limiteEfetivo,
  limitesEfetivos,
} from '../../src/config/uploadLimits.js'

describe('limiteEfetivo', () => {
  it('corta a promessa da categoria pelo teto do multipart', () => {
    // A categoria diz 100 MB; o multipart nunca deixa passar de 25 MB.
    expect(FILE_SIZE_LIMITS.video).toBeGreaterThan(MAX_UPLOAD_BYTES)
    expect(limiteEfetivo('video')).toBe(MAX_UPLOAD_BYTES)
  })

  it('preserva a categoria quando ela é mais restritiva que o teto', () => {
    expect(FILE_SIZE_LIMITS.image).toBeLessThan(MAX_UPLOAD_BYTES)
    expect(limiteEfetivo('image')).toBe(FILE_SIZE_LIMITS.image)
  })

  it('nenhuma categoria promete mais do que o servidor aceita', () => {
    for (const [categoria, efetivo] of Object.entries(limitesEfetivos())) {
      expect(efetivo, `categoria ${categoria}`).toBeLessThanOrEqual(MAX_UPLOAD_BYTES)
    }
  })

  it('cobre todas as categorias declaradas', () => {
    expect(Object.keys(limitesEfetivos()).sort()).toEqual(
      Object.keys(FILE_SIZE_LIMITS).sort(),
    )
  })
})

describe('ALLOWED_MIME_TYPES', () => {
  it('não aceita SVG — pode carregar <script> e virar XSS no viewer', () => {
    expect(ALLOWED_MIME_TYPES).not.toHaveProperty('image/svg+xml')
  })

  it('toda entrada tem ao menos uma extensão', () => {
    for (const [mime, exts] of Object.entries(ALLOWED_MIME_TYPES)) {
      expect(exts.length, `mime ${mime}`).toBeGreaterThan(0)
    }
  })
})
