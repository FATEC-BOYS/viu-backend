import prisma from '../database/client.js'
import { mpPayment } from './mercadoPagoService.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { PAGAMENTO_TRANSITIONS, FATURA_TRANSITIONS } from '../utils/stateMachine.js'

const MP_PAYMENT_STATUS_MAP: Record<string, string> = {
  pending: 'PENDENTE',
  in_process: 'PROCESSANDO',
  approved: 'APROVADO',
  rejected: 'REJEITADO',
  cancelled: 'CANCELADO',
  refunded: 'ESTORNADO',
  charged_back: 'ESTORNADO',
}

export class PagamentoService {
  async handleWebhookPagamento(mpPaymentId: string) {
    const payment = await mpPayment.get({ id: Number(mpPaymentId) })
    if (!payment?.id) return

    const status = MP_PAYMENT_STATUS_MAP[payment.status ?? ''] ?? 'PENDENTE'
    const metodoPagamento = this.mapPaymentMethod((payment as any).payment_method_id)

    const pagamento = await prisma.pagamento.findUnique({
      where: { mpPaymentId: String(payment.id) },
    })
    if (!pagamento) return

    // Webhook may deliver duplicate or out-of-order events; skip invalid transitions silently
    // (the gateway is authoritative — log and move on rather than erroring the webhook response)
    const allowedNext = PAGAMENTO_TRANSITIONS[pagamento.status] ?? []
    if (status !== pagamento.status && !allowedNext.includes(status)) {
      console.warn(`[pagamento] transição ignorada: ${pagamento.status} → ${status} (id=${pagamento.id})`)
      return
    }

    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { status, mpStatus: payment.status ?? null, metodoPagamento },
    })

    if (status === 'APROVADO' && pagamento.faturaId) {
      const fatura = await prisma.fatura.findUnique({ where: { id: pagamento.faturaId }, select: { status: true } })
      if (fatura && (FATURA_TRANSITIONS[fatura.status] ?? []).includes('PAGA')) {
        await prisma.fatura.update({
          where: { id: pagamento.faturaId },
          data: { status: 'PAGA', dataPagamento: new Date() },
        })
      }
    }

    if (status === 'ESTORNADO' && pagamento.faturaId) {
      const fatura = await prisma.fatura.findUnique({ where: { id: pagamento.faturaId }, select: { status: true } })
      if (fatura && (FATURA_TRANSITIONS[fatura.status] ?? []).includes('ESTORNADA')) {
        await prisma.fatura.update({
          where: { id: pagamento.faturaId },
          data: { status: 'ESTORNADA' },
        })
      }
    }
  }

  async listarPagamentos(usuarioId: string) {
    const pagamentos = await prisma.pagamento.findMany({
      where: { usuarioId },
      include: {
        fatura: { select: { id: true, valor: true, descricao: true } },
        assinatura: { select: { id: true, plano: { select: { nome: true, tipo: true } } } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    return pagamentos.map((p) => ({
      ...p,
      valorFormatado: formatCurrency(p.valor),
      criadoEmFormatado: formatDate(p.criadoEm),
    }))
  }

  private mapPaymentMethod(mpMethod?: string): string {
    if (!mpMethod) return 'DESCONHECIDO'
    if (mpMethod === 'pix') return 'PIX'
    if (['bolbradesco', 'pec', 'boleto'].includes(mpMethod)) return 'BOLETO'
    return 'CARTAO_CREDITO'
  }
}
