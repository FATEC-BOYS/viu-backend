import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A coluna `avatar` guarda duas coisas diferentes: a chave do R2, quando a
 * pessoa subiu um arquivo, e uma URL absoluta, quando veio do seed. Quem lê
 * não sabe qual das duas veio — e foi por isso que a leitura ficou para trás
 * enquanto só a resposta do upload assinava.
 */
vi.mock('../../src/storage.js', () => ({ r2: {}, R2_BUCKET: 'balde' }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_cliente: unknown, comando: any) =>
    `https://r2.exemplo/${comando.input.Key}?assinada`),
}))

import { assinarAvatar } from '../../src/utils/storage.js'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

beforeEach(() => vi.clearAllMocks())

describe('assinarAvatar', () => {
  it('assina a chave do bucket', async () => {
    expect(await assinarAvatar('avatars/u1/123_foto.png'))
      .toBe('https://r2.exemplo/avatars/u1/123_foto.png?assinada')
  })

  /** `signPath` devolve null para URL externa — de propósito, para não
   * assinar link de terceiro. Sem a passagem direta, a foto do seed sumiria. */
  it('deixa passar URL absoluta sem assinar', async () => {
    const url = 'https://images.unsplash.com/photo-149?w=150'
    expect(await assinarAvatar(url)).toBe(url)
    expect(getSignedUrl).not.toHaveBeenCalled()
  })

  it('devolve null para quem não tem foto', async () => {
    expect(await assinarAvatar(null)).toBeNull()
    expect(await assinarAvatar(undefined)).toBeNull()
    expect(await assinarAvatar('')).toBeNull()
    expect(getSignedUrl).not.toHaveBeenCalled()
  })
})
