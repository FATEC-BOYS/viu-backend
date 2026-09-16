import { describe, it, expect } from 'vitest'
import { chaveDoComentario } from '../../src/utils/rateLimitComentario.js'

/**
 * O limite de comentários é por credencial, não por IP.
 *
 * Por IP ele pune junto quem divide escritório, wi-fi de cafeteria ou
 * operadora móvel — e não segura script atrás de IP rotativo. Por credencial,
 * um balde novo passa a custar uma conta nova, e cadastro já tem limite.
 */

function requisicao(headers: Record<string, string>, ip = '10.0.0.1') {
  return { headers, ip } as any
}

describe('chaveDoComentario', () => {
  it('duas pessoas no mesmo IP não dividem o balde', () => {
    const a = chaveDoComentario(requisicao({ cookie: 'viu_token=aaa' }))
    const b = chaveDoComentario(requisicao({ cookie: 'viu_token=bbb' }))
    expect(a).not.toBe(b)
  })

  it('a mesma pessoa em IPs diferentes divide o mesmo balde', () => {
    const casa = chaveDoComentario(requisicao({ cookie: 'viu_token=aaa' }, '10.0.0.1'))
    const rua = chaveDoComentario(requisicao({ cookie: 'viu_token=aaa' }, '200.1.1.9'))
    expect(casa).toBe(rua)
  })

  it('sem credencial, cai no IP — quem não manda nada ainda é contado', () => {
    expect(chaveDoComentario(requisicao({}, '10.0.0.7'))).toBe('ip:10.0.0.7')
  })

  it('a credencial não aparece na chave', () => {
    const chave = chaveDoComentario(requisicao({ authorization: 'Bearer segredo-do-usuario' }))
    expect(chave).not.toContain('segredo-do-usuario')
    expect(chave.startsWith('cred:')).toBe(true)
  })
})
