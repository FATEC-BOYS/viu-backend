import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import { recusarCadastro, criarTokenDeRecusa } from '../../src/services/recusaCadastroService.js'

/**
 * A saída de quem foi cadastrado sem pedir.
 *
 * O ponto destes testes é a fronteira: o que sai sozinho e o que NÃO sai. O
 * link chega por e-mail, e e-mail é alcançável — então remover conta que já
 * está em uso, ou que carrega histórico de outras pessoas, seria pior que o
 * problema original.
 */

const db = prisma as any

function conta(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    ativo: true,
    excluidoEm: null,
    emailVerificado: false,
    recusaCadastroExpiraEm: new Date(Date.now() + 86400000),
    ...over,
  }
}

function semAtividade() {
  db.feedback.count.mockResolvedValue(0)
  db.aprovacao.count.mockResolvedValue(0)
  db.pagamento.count.mockResolvedValue(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  db.projeto.findMany.mockResolvedValue([])
  db.usuario.findUnique.mockResolvedValue({ id: 'u1' })
  db.$transaction.mockResolvedValue([])
})

describe('criarTokenDeRecusa', () => {
  it('guarda o hash, nunca o token cru', async () => {
    db.usuario.update.mockResolvedValue({})

    const cru = await criarTokenDeRecusa('u1')

    const [argumentos] = db.usuario.update.mock.calls[0] as [any]
    expect(argumentos.data.recusaCadastroToken).not.toBe(cru)
    expect(argumentos.data.recusaCadastroToken).toHaveLength(64)
    expect(argumentos.data.recusaCadastroExpiraEm).toBeInstanceOf(Date)
  })
})

describe('recusarCadastro — o que sai sozinho', () => {
  it('remove a conta nunca usada', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    semAtividade()
    db.conviteProjeto.updateMany.mockResolvedValue({ count: 1 })

    await recusarCadastro('token-cru')

    // A remoção é a mesma do pedido de exclusão do titular: anonimiza.
    expect(db.$transaction).toHaveBeenCalled()
  })

  it('cancela convites pendentes — convite para conta que sumiu é beco', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    semAtividade()
    db.conviteProjeto.updateMany.mockResolvedValue({ count: 2 })

    await recusarCadastro('token-cru')

    const [argumentos] = db.conviteProjeto.updateMany.mock.calls[0] as [any]
    expect(argumentos.where).toMatchObject({ convidadoId: 'u1', status: 'PENDENTE' })
    expect(argumentos.data.status).toBe('CANCELADO')
  })

  it('avisa o designer de cada projeto onde a pessoa era cliente', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    semAtividade()
    db.conviteProjeto.updateMany.mockResolvedValue({ count: 0 })
    db.projeto.findMany.mockResolvedValue([
      { id: 'p1', nome: 'Marca', designerId: 'd1' },
      { id: 'p2', nome: 'Site', designerId: 'd2' },
    ])

    const r = await recusarCadastro('token-cru')

    expect(r.projetosAfetados).toHaveLength(2)
    expect(db.notificacao.create).toHaveBeenCalledTimes(2)
  })
})

describe('recusarCadastro — o que NÃO sai sozinho', () => {
  it('conta com e-mail confirmado: quem usa é quem manda', async () => {
    db.usuario.findFirst.mockResolvedValue(conta({ emailVerificado: true }))

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({
      codigo: 'RECUSA_BLOQUEADA',
      motivo: 'CONTA_EM_USO',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('já comentou: apagar levaria junto conversa de outra pessoa', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    db.feedback.count.mockResolvedValue(3)
    db.aprovacao.count.mockResolvedValue(0)
    db.pagamento.count.mockResolvedValue(0)

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({
      motivo: 'ATIVIDADE_REAL',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('já decidiu uma aprovação', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    db.feedback.count.mockResolvedValue(0)
    db.aprovacao.count.mockResolvedValue(1)
    db.pagamento.count.mockResolvedValue(0)

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({
      motivo: 'ATIVIDADE_REAL',
    })
  })

  it('já pagou', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    db.feedback.count.mockResolvedValue(0)
    db.aprovacao.count.mockResolvedValue(0)
    db.pagamento.count.mockResolvedValue(2)

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({
      motivo: 'ATIVIDADE_REAL',
    })
  })

  /*
   * Aprovação PENDENTE foi criada pelo DESIGNER pedindo a decisão — não pela
   * pessoa tomando uma. Contá-la travaria a saída de quem nunca fez nada.
   */
  it('aprovação pendente não é atividade dela', async () => {
    db.usuario.findFirst.mockResolvedValue(conta())
    semAtividade()
    db.conviteProjeto.updateMany.mockResolvedValue({ count: 0 })

    await recusarCadastro('token-cru')

    const [argumentos] = db.aprovacao.count.mock.calls[0] as [any]
    expect(argumentos.where.status).toEqual({ in: ['APROVADO', 'REJEITADO'] })
  })
})

describe('recusarCadastro — token', () => {
  it('token desconhecido não diz o que existe', async () => {
    db.usuario.findFirst.mockResolvedValue(null)

    await expect(recusarCadastro('qualquer')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('token vencido não vale', async () => {
    db.usuario.findFirst.mockResolvedValue(
      conta({ recusaCadastroExpiraEm: new Date(Date.now() - 1000) }),
    )

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('clicar duas vezes não quebra', async () => {
    db.usuario.findFirst.mockResolvedValue(conta({ ativo: false, excluidoEm: new Date() }))

    await expect(recusarCadastro('token-cru')).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })
})
