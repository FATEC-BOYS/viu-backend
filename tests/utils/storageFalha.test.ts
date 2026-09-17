import { describe, it, expect, vi, beforeEach } from 'vitest'

const send = vi.fn()
vi.mock('../../src/storage.js', () => ({
  r2: { send: (...args: unknown[]) => send(...args) },
  R2_BUCKET: 'viu-test',
}))

import { uploadFile, ArmazenamentoIndisponivelError } from '../../src/utils/storage.js'

/**
 * A falha de armazenamento precisa se distinguir das outras.
 *
 * O controller colapsava tudo num 500 "Erro ao criar arte", e as saídas de
 * quem lê são opostas: armazenamento fora do ar se resolve tentando de novo
 * daqui a pouco, e nada foi criado no caminho; erro ao gravar a arte no banco,
 * não. Sem um erro tipado na origem, o controller não tinha como separar.
 */
describe('uploadFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devolve a chave quando o bucket aceita', async () => {
    send.mockResolvedValue({})
    await expect(uploadFile('artes/a/b.png', Buffer.from('x'), 'image/png')).resolves.toBe(
      'artes/a/b.png',
    )
  })

  it('embrulha a falha do bucket num erro com código', async () => {
    send.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9'))

    const erro = await uploadFile('artes/a/b.png', Buffer.from('x'), 'image/png').catch((e) => e)

    expect(erro).toBeInstanceOf(ArmazenamentoIndisponivelError)
    expect(erro.codigo).toBe('ARMAZENAMENTO_INDISPONIVEL')
  })

  it('preserva a causa original, que é o que o log precisa', async () => {
    // Credencial errada e bucket fora do ar chegam aqui iguais; só a causa
    // distingue, e é ela que alguém vai ler às três da manhã.
    const causa = new Error('The AWS Access Key Id you provided does not exist')
    send.mockRejectedValue(causa)

    const erro = await uploadFile('k', Buffer.from('x'), 'image/png').catch((e) => e)

    expect(erro.causa).toBe(causa)
  })
})
