import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

vi.mock('../../src/services/mercadoPagoService.js', () => ({
  mpPayment: { get: vi.fn() },
  mpPreApproval: {},
  mpRefund: { total: vi.fn() },
  validateMpWebhookSignature: vi.fn().mockReturnValue(true),
}))

import prisma from '../../src/database/client.js'
import { mpRefund } from '../../src/services/mercadoPagoService.js'
import { aplicarEstornoNosLivros, estornarFatura } from '../../src/services/estornoService.js'
import { DisputaService } from '../../src/services/disputaService.js'

const db = prisma as any
const disputas = new DisputaService()

const FATURA = 'cf00000000000000000000001'
const DISPUTA = 'cd00000000000000000000001'

/** A fatura paga que a arbitragem vai desfazer. */
function faturaPaga(extra: Record<string, unknown> = {}) {
  return {
    id: FATURA,
    status: 'PAGA',
    valor: 100_000,
    valorLiquidoDesigner: 90_000,
    designerId: 'd1',
    clienteId: 'c1',
    pagamento: { mpPaymentId: '12345' },
    projeto: { nome: 'Identidade visual' },
    ...extra,
  } as any
}

/** Faz o `$transaction(cb)` rodar de verdade, com o updateMany respondendo. */
function transacaoQueAplica(count: number) {
  db.fatura.updateMany.mockResolvedValue({ count })
  db.pagamento.updateMany.mockResolvedValue({ count: 1 })
  db.ledgerEntry.create.mockResolvedValue({})
}

beforeEach(() => {
  vi.clearAllMocks()
  /*
   * `clearAllMocks` zera as chamadas, não as implementações: um
   * `mockRejectedValue` de um teste anterior continuaria valendo e faria o
   * próximo falhar por um erro que ele não pediu. Redefinir aqui é o que torna
   * cada caso legível sozinho.
   */
  vi.mocked(mpRefund.total).mockResolvedValue({} as any)
  db.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg),
  )
})

/**
 * O defeito que isto fecha: o saldo do designer é
 * `Σ fatura.valorLiquidoDesigner (PAGA) − saques − Σ saldoBloqueado`.
 * Resolver a disputa zerava o bloqueio e deixava a fatura PAGA — então a
 * parcela voltava para a soma. Decidir A FAVOR DO CLIENTE pagava o designer.
 */
describe('estornar uma fatura', () => {
  it('devolve o valor cheio no gateway, não só a parte do designer', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    transacaoQueAplica(1)

    const r = await estornarFatura(FATURA, 'Disputa resolvida a favor do cliente')

    // `total()` e não um parcial de 90.000: reter a taxa numa transação
    // desfeita é lucro sobre trabalho que a arbitragem julgou não entregue.
    expect(mpRefund.total).toHaveBeenCalledWith({ payment_id: '12345' })
    expect(r).toEqual({ aplicado: true, viaGateway: true, valorDevolvido: 100_000 })
  })

  it('tira a fatura de PAGA — senão o saldo do designer não muda', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    transacaoQueAplica(1)

    await estornarFatura(FATURA, 'motivo')

    expect(db.fatura.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ESTORNADA' } }),
    )
  })

  it('debita no extrato o líquido do designer, com referência de estorno', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    transacaoQueAplica(1)

    await estornarFatura(FATURA, 'motivo')

    expect(db.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'DEBITO',
        valor: 90_000,
        referencia: `estorno-fatura:${FATURA}`,
        designerId: 'd1',
      }),
    })
  })

  it('se o Mercado Pago recusar, nada é escrito', async () => {
    // Fatura marcada ESTORNADA sem devolução é pior que disputa em aberto:
    // some do saldo do designer e não aparece no extrato do cliente.
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    vi.mocked(mpRefund.total).mockRejectedValue(new Error('insufficient_funds'))

    await expect(estornarFatura(FATURA, 'motivo')).rejects.toThrow('recusou o estorno')
    expect(db.fatura.updateMany).not.toHaveBeenCalled()
    expect(db.ledgerEntry.create).not.toHaveBeenCalled()
  })

  it('a recusa carrega o motivo do gateway, não um erro genérico', async () => {
    // "saldo insuficiente" e "pagamento antigo demais" pedem ações diferentes
    // de quem arbitrou.
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    vi.mocked(mpRefund.total).mockRejectedValue(new Error('refund_period_expired'))

    await expect(estornarFatura(FATURA, 'motivo')).rejects.toThrow('refund_period_expired')
  })

  it('fatura paga fora do gateway acerta os livros e avisa que o dinheiro não saiu', async () => {
    // Silenciar isto faria a tela dizer "devolvido" sobre dinheiro parado.
    db.fatura.findUnique.mockResolvedValue(faturaPaga({ pagamento: null }))
    transacaoQueAplica(1)

    const r = await estornarFatura(FATURA, 'motivo')

    expect(mpRefund.total).not.toHaveBeenCalled()
    expect(r.viaGateway).toBe(false)
    expect(r.aplicado).toBe(true)
  })

  it('fatura já estornada não estorna de novo', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPaga({ status: 'ESTORNADA' }))

    const r = await estornarFatura(FATURA, 'motivo')

    expect(r.aplicado).toBe(false)
    expect(mpRefund.total).not.toHaveBeenCalled()
  })

  it('fatura que nunca foi paga recusa com o estado na mensagem', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPaga({ status: 'PENDENTE' }))

    await expect(estornarFatura(FATURA, 'motivo')).rejects.toThrow('Não há o que estornar')
    expect(mpRefund.total).not.toHaveBeenCalled()
  })

  it('fatura inexistente não vira estorno silencioso', async () => {
    db.fatura.findUnique.mockResolvedValue(null)
    await expect(estornarFatura(FATURA, 'motivo')).rejects.toThrow('Fatura não encontrada')
  })
})

/**
 * O webhook do Mercado Pago e a arbitragem escrevem o mesmo estorno. Chegando
 * juntos, dois lançamentos debitariam o designer duas vezes pelo mesmo dinheiro.
 */
describe('a escrita do estorno é idempotente', () => {
  it('quem perde a corrida do compare-and-set não cria lançamento', async () => {
    db.fatura.findUnique.mockResolvedValue({ valorLiquidoDesigner: 90_000, designerId: 'd1' })
    transacaoQueAplica(0)

    const aplicou = await aplicarEstornoNosLivros(FATURA, 'Estorno de fatura')

    expect(aplicou).toBe(false)
    expect(db.ledgerEntry.create).not.toHaveBeenCalled()
  })

  it('o compare-and-set filtra pelo status, não só pelo id', async () => {
    // `update({ where: { id } })` seguido de leitura seria TOCTOU: os dois
    // caminhos leriam PAGA e os dois escreveriam.
    db.fatura.findUnique.mockResolvedValue({ valorLiquidoDesigner: 90_000, designerId: 'd1' })
    transacaoQueAplica(1)

    await aplicarEstornoNosLivros(FATURA, 'Estorno de fatura')

    const where = db.fatura.updateMany.mock.calls[0][0].where
    expect(where.id).toBe(FATURA)
    expect(where.status.in).toContain('PAGA')
  })

  it('deriva da máquina de estados quais faturas são estornáveis', async () => {
    // `['PAGA']` escrito à mão sairia de sincronia no primeiro estado novo.
    db.fatura.findUnique.mockResolvedValue({ valorLiquidoDesigner: 1, designerId: 'd1' })
    transacaoQueAplica(1)

    await aplicarEstornoNosLivros(FATURA, 'x')

    const where = db.fatura.updateMany.mock.calls[0][0].where
    expect(where.status.in).not.toContain('ESTORNADA')
    expect(where.status.in).not.toContain('CANCELADA')
  })
})

describe('resolver a disputa move o dinheiro junto', () => {
  function disputaAberta(extra: Record<string, unknown> = {}) {
    return { id: DISPUTA, status: 'ABERTA', faturaId: FATURA, ...extra } as any
  }

  it('a favor do cliente estorna a fatura', async () => {
    db.disputa.findUnique.mockResolvedValue(disputaAberta())
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    transacaoQueAplica(1)
    db.disputa.update.mockResolvedValue({ id: DISPUTA, status: 'RESOLVIDA_CLIENTE' })

    const r: any = await disputas.resolverDisputa(DISPUTA, {
      status: 'RESOLVIDA_CLIENTE',
      resolucao: 'Entrega não corresponde ao combinado',
    })

    expect(mpRefund.total).toHaveBeenCalled()
    expect(r.estorno).toEqual({ aplicado: true, viaGateway: true, valorDevolvido: 100_000 })
  })

  it('a favor do designer não estorna nada', async () => {
    db.disputa.findUnique.mockResolvedValue(disputaAberta())
    db.disputa.update.mockResolvedValue({ id: DISPUTA, status: 'RESOLVIDA_DESIGNER' })

    const r: any = await disputas.resolverDisputa(DISPUTA, {
      status: 'RESOLVIDA_DESIGNER',
      resolucao: 'Entrega confere com o contrato',
    })

    expect(mpRefund.total).not.toHaveBeenCalled()
    expect(r.estorno).toBeNull()
  })

  it('escalar não estorna — escalar não é resolver', async () => {
    db.disputa.findUnique.mockResolvedValue(disputaAberta())
    db.disputa.update.mockResolvedValue({ id: DISPUTA, status: 'ESCALADA' })

    await disputas.resolverDisputa(DISPUTA, { status: 'ESCALADA', resolucao: 'Precisa de análise' })

    expect(mpRefund.total).not.toHaveBeenCalled()
  })

  it('se o estorno falhar, a disputa continua em aberto', async () => {
    // O contrário — resolvida a favor do cliente com o dinheiro ainda no saldo
    // do designer — é um acerto que ninguém mais vai procurar.
    db.disputa.findUnique.mockResolvedValue(disputaAberta())
    db.fatura.findUnique.mockResolvedValue(faturaPaga())
    vi.mocked(mpRefund.total).mockRejectedValue(new Error('insufficient_funds'))

    await expect(
      disputas.resolverDisputa(DISPUTA, { status: 'RESOLVIDA_CLIENTE', resolucao: 'x' }),
    ).rejects.toThrow('recusou o estorno')
    expect(db.disputa.update).not.toHaveBeenCalled()
  })

  it('disputa sem fatura resolve a favor do cliente sem estornar', async () => {
    // Reclamação de entrega antes de haver cobrança continua arbitrável.
    db.disputa.findUnique.mockResolvedValue(disputaAberta({ faturaId: null }))
    db.disputa.update.mockResolvedValue({ id: DISPUTA, status: 'RESOLVIDA_CLIENTE' })

    const r: any = await disputas.resolverDisputa(DISPUTA, {
      status: 'RESOLVIDA_CLIENTE',
      resolucao: 'Projeto nunca começou',
    })

    expect(r.estorno).toBeNull()
    expect(db.disputa.update).toHaveBeenCalled()
  })
})
