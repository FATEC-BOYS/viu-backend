import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PagamentoService } from '../../src/services/pagamentoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('../../src/services/mercadoPagoService.js', () => ({
  mpPayment: { get: vi.fn() },
  mpPreApproval: {},
  validateMpWebhookSignature: vi.fn().mockReturnValue(true),
}))

import prisma from '../../src/database/client.js'
import { mpPayment } from '../../src/services/mercadoPagoService.js'

const service = new PagamentoService()

beforeEach(() => vi.clearAllMocks())

// ─── handleWebhookPagamento ────────────────────────────────────────────────

describe('PagamentoService.handleWebhookPagamento', () => {
  it('atualiza pagamento para APROVADO e cria ledger CREDITO para fatura', async () => {
    vi.mocked(mpPayment.get).mockResolvedValue({ id: 999, status: 'approved' } as any)
    vi.mocked(prisma.pagamento.findUnique).mockResolvedValue({
      id: 'pag1', mpPaymentId: '999', status: 'PENDENTE', faturaId: 'fat1',
    } as any)
    vi.mocked(prisma.pagamento.update).mockResolvedValue({} as any)
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue({
      status: 'PENDENTE', valorLiquidoDesigner: 8000, designerId: 'd1',
    } as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as any)

    await service.handleWebhookPagamento('999')

    expect(prisma.pagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APROVADO' }) }),
    )
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('ignora transição inválida e não atualiza pagamento', async () => {
    vi.mocked(mpPayment.get).mockResolvedValue({ id: 998, status: 'pending' } as any)
    vi.mocked(prisma.pagamento.findUnique).mockResolvedValue({
      id: 'pag2', mpPaymentId: '998', status: 'APROVADO', faturaId: null,
    } as any)

    await service.handleWebhookPagamento('998')

    expect(prisma.pagamento.update).not.toHaveBeenCalled()
  })

  it('retorna sem erro quando pagamento não existe no banco', async () => {
    vi.mocked(mpPayment.get).mockResolvedValue({ id: 997, status: 'approved' } as any)
    vi.mocked(prisma.pagamento.findUnique).mockResolvedValue(null)

    await expect(service.handleWebhookPagamento('997')).resolves.toBeUndefined()
    expect(prisma.pagamento.update).not.toHaveBeenCalled()
  })

  it('retorna sem erro quando mpPayment não retorna id', async () => {
    vi.mocked(mpPayment.get).mockResolvedValue(null as any)

    await expect(service.handleWebhookPagamento('996')).resolves.toBeUndefined()
  })

  it('cria ledger DEBITO de estorno quando pagamento → ESTORNADO', async () => {
    vi.mocked(mpPayment.get).mockResolvedValue({ id: 995, status: 'refunded' } as any)
    vi.mocked(prisma.pagamento.findUnique).mockResolvedValue({
      id: 'pag3', mpPaymentId: '995', status: 'APROVADO', faturaId: 'fat2',
    } as any)
    vi.mocked(prisma.pagamento.update).mockResolvedValue({} as any)
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue({
      status: 'PAGA', valorLiquidoDesigner: 5000, designerId: 'd2',
    } as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as any)

    await service.handleWebhookPagamento('995')

    expect(prisma.$transaction).toHaveBeenCalled()
  })
})

// ─── processarWebhookAsync ────────────────────────────────────────────────

describe('PagamentoService.processarWebhookAsync', () => {
  it('cria WebhookLog e processa pagamento', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.webhookLog.update).mockResolvedValue({} as any)
    vi.mocked(mpPayment.get).mockResolvedValue(null as any)
    vi.mocked(prisma.pagamento.findUnique).mockResolvedValue(null)

    await service.processarWebhookAsync('req-123', 'payment', '111', { type: 'payment', data: { id: '111' } })

    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalId: 'req-123', tipo: 'payment', status: 'RECEBIDO' }),
      }),
    )
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSADO' }) }),
    )
  })

  it('ignora silenciosamente notificação duplicada (P2002)', async () => {
    const err = Object.assign(new Error('unique'), { code: 'P2002' })
    vi.mocked(prisma.webhookLog.create).mockRejectedValue(err)

    await expect(
      service.processarWebhookAsync('req-dup', 'payment', '222', {}),
    ).resolves.toBeUndefined()

    expect(prisma.webhookLog.update).not.toHaveBeenCalled()
  })

  it('marca WebhookLog como ERRO quando processamento falha', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.webhookLog.update).mockResolvedValue({} as any)
    vi.mocked(mpPayment.get).mockRejectedValue(new Error('MP offline'))

    await service.processarWebhookAsync('req-err', 'payment', '333', {})

    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ERRO', erro: 'MP offline' }) }),
    )
  })
})
