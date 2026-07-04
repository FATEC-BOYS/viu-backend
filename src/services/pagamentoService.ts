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
      const fatura = await prisma.fatura.findUnique({
        where: { id: pagamento.faturaId },
        select: { status: true, valorLiquidoDesigner: true, designerId: true },
      })
      if (fatura && (FATURA_TRANSITIONS[fatura.status] ?? []).includes('PAGA')) {
        await prisma.$transaction([
          prisma.fatura.update({
            where: { id: pagamento.faturaId },
            data: { status: 'PAGA', dataPagamento: new Date() },
          }),
          // Ledger: registra crédito para o designer no momento em que a fatura é liquidada
          prisma.ledgerEntry.create({
            data: {
              tipo: 'CREDITO',
              valor: fatura.valorLiquidoDesigner,
              descricao: 'Pagamento de fatura recebido',
              referencia: `fatura:${pagamento.faturaId}`,
              designerId: fatura.designerId,
            },
          }),
        ])
      }
    }

    if (status === 'ESTORNADO' && pagamento.faturaId) {
      const fatura = await prisma.fatura.findUnique({
        where: { id: pagamento.faturaId },
        select: { status: true, valorLiquidoDesigner: true, designerId: true },
      })
      if (fatura && (FATURA_TRANSITIONS[fatura.status] ?? []).includes('ESTORNADA')) {
        await prisma.$transaction([
          prisma.fatura.update({
            where: { id: pagamento.faturaId },
            data: { status: 'ESTORNADA' },
          }),
          // Ledger: estorno reverte o crédito anterior
          prisma.ledgerEntry.create({
            data: {
              tipo: 'DEBITO',
              valor: fatura.valorLiquidoDesigner,
              descricao: 'Estorno de fatura',
              referencia: `fatura:${pagamento.faturaId}`,
              designerId: fatura.designerId,
            },
          }),
        ])
      }
    }
  }

  // Deduplicação por externalId (MP x-request-id). Responde ao gateway antes de processar
  // para evitar retentativas por timeout — processamento é feito de forma assíncrona.
  async processarWebhookAsync(externalId: string, tipo: string, mpPaymentId: string, payload: unknown) {
    // Unique constraint no externalId impede processamento duplicado mesmo com alta concorrência
    try {
      await prisma.webhookLog.create({
        data: { externalId, tipo, payload: payload as any, status: 'RECEBIDO' },
      })
    } catch (err: any) {
      // P2002 = unique constraint violation — já processado
      if (err?.code === 'P2002') {
        console.info(`[webhook] duplicado ignorado: ${externalId}`)
        return
      }
      throw err
    }

    try {
      await this.handleWebhookPagamento(mpPaymentId)
      await prisma.webhookLog.update({
        where: { externalId },
        data: { status: 'PROCESSADO', processadoEm: new Date() },
      })
    } catch (err: any) {
      await prisma.webhookLog.update({
        where: { externalId },
        data: { status: 'ERRO', erro: String(err?.message ?? err), tentativas: { increment: 1 } },
      })
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

const _svc = new PagamentoService()
export const handleWebhookPagamento = (...args: Parameters<PagamentoService['handleWebhookPagamento']>) => _svc.handleWebhookPagamento(...args)
export const processarWebhookAsync = (...args: Parameters<PagamentoService['processarWebhookAsync']>) => _svc.processarWebhookAsync(...args)
export const listarPagamentos = (...args: Parameters<PagamentoService['listarPagamentos']>) => _svc.listarPagamentos(...args)
