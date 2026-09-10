import { describe, it, expect } from 'vitest'
import { novoId } from '../../src/utils/ids.js'
import { validateCuidParam } from '../../src/middleware/validationMiddleware.js'

/**
 * O id que geramos precisa passar pelo validador que guarda toda rota `/:id`.
 *
 * Quando não passava, a arte subia normalmente e depois nada funcionava com
 * ela: abrir, editar, excluir e listar versões respondiam 400. O upload usava
 * `randomUUID()` porque precisa do id antes do `create` — a chave do bucket é
 * montada com ele — e ninguém percebeu que o formato era outro.
 */
function chamarValidador(id: string) {
  let status: number | null = null
  const reply = {
    status(codigo: number) { status = codigo; return this },
    send() { return this },
  }
  return validateCuidParam({ params: { id } } as never, reply as never).then(() => status)
}

describe('novoId', () => {
  it('nasce no formato que o banco gera sozinho', () => {
    expect(novoId()).toMatch(/^c[0-9a-f]{24}$/)
  })

  it('não repete', () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoId()))
    expect(ids.size).toBe(500)
  })

  it('passa pelo validador de parâmetro de rota', async () => {
    for (let i = 0; i < 50; i++) {
      expect(await chamarValidador(novoId())).toBeNull()
    }
  })
})

describe('validateCuidParam', () => {
  /** As artes que já subiram com UUID precisam continuar acessíveis. */
  it('aceita o UUID das artes antigas', async () => {
    expect(await chamarValidador('c30d85d3-3e80-4389-8bca-7ec41140a038')).toBeNull()
  })

  it('recusa lixo', async () => {
    // `'c' + 24 alfanuméricos` fica de fora de propósito: é exatamente o
    // formato válido, ainda que as letras não signifiquem nada.
    for (const ruim of ['', '../etc/passwd', "1' OR '1'='1", 'abc', 'c'.repeat(40), 'c30d85d3-3e80-4389-8bca']) {
      expect(await chamarValidador(ruim)).toBe(400)
    }
  })
})
