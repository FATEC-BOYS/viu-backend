import prisma from '../database/client.js'
import { mpPreApproval } from './mercadoPagoService.js'
import { ASSINATURA_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'
import { env } from '../config/env.js'

const MP_STATUS_MAP: Record<string, string> = {
  authorized: 'ATIVA',
  pending: 'PENDENTE',
  paused: 'PAUSADA',
  cancelled: 'CANCELADA',
}

export class AssinaturaService {
  async getMinhaAssinatura(usuarioId: string) {
    return prisma.assinatura.findFirst({
      where: { usuarioId, status: { in: ['ATIVA', 'PENDENTE', 'PAUSADA'] } },
      include: { plano: true },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async criarAssinatura(usuarioId: string, planoId: string, email: string) {
    const plano = await prisma.plano.findUnique({ where: { id: planoId, ativo: true } })
    if (!plano) throw new Error('Plano não encontrado ou inativo')

    const assinaturaAtiva = await prisma.assinatura.findFirst({
      where: { usuarioId, status: { in: ['ATIVA', 'PENDENTE'] } },
    })
    if (assinaturaAtiva) throw new Error('Usuário já possui uma assinatura ativa')

    if (plano.precoMensal === 0) {
      return prisma.assinatura.create({
        data: { usuarioId, planoId, status: 'ATIVA', periodoInicio: new Date() },
        include: { plano: true },
      })
    }

    const preapproval = await mpPreApproval.create({
      body: {
        reason: `VIU ${plano.nome} - ${plano.tipo}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plano.precoMensal / 100,
          currency_id: 'BRL',
        },
        payer_email: email,
        back_url: `${env.FRONTEND_URL}/pagamento/assinatura/confirmacao`,
        status: 'pending',
      },
    })

    const assinatura = await prisma.assinatura.create({
      data: {
        usuarioId,
        planoId,
        status: 'PENDENTE',
        mpPreapprovalId: preapproval.id ?? undefined,
        renovacaoAutomatica: true,
      },
      include: { plano: true },
    })

    return {
      ...assinatura,
      checkoutUrl: (preapproval as any).init_point ?? null,
    }
  }

  async cancelarAssinatura(id: string, usuarioId: string) {
    const assinatura = await prisma.assinatura.findUnique({ where: { id } })
    if (!assinatura) throw new Error('Assinatura não encontrada')
    if (assinatura.usuarioId !== usuarioId) throw new Error('Acesso negado')
    if (!['ATIVA', 'PAUSADA'].includes(assinatura.status)) {
      throw new Error('Assinatura não pode ser cancelada no status atual')
    }

    if (assinatura.mpPreapprovalId) {
      await mpPreApproval.update({
        id: assinatura.mpPreapprovalId,
        body: { status: 'cancelled' },
      })
    }

    return prisma.assinatura.update({
      where: { id },
      data: { status: 'CANCELADA', renovacaoAutomatica: false },
      include: { plano: true },
    })
  }

  async handleWebhookAssinatura(preapprovalId: string) {
    const preapproval = await mpPreApproval.get({ id: preapprovalId })
    const novoStatus = MP_STATUS_MAP[preapproval.status ?? ''] ?? 'PENDENTE'

    const assinatura = await prisma.assinatura.findUnique({
      where: { mpPreapprovalId: preapprovalId },
      include: { plano: true },
    })
    if (!assinatura) return

    // Skip invalid transitions silently (idempotent webhook handling)
    const allowed = ASSINATURA_TRANSITIONS[assinatura.status] ?? []
    if (novoStatus !== assinatura.status && !allowed.includes(novoStatus)) {
      console.warn(`[assinatura] transição ignorada: ${assinatura.status} → ${novoStatus} (id=${assinatura.id})`)
      return
    }

    const updateData: any = { status: novoStatus }
    if (novoStatus === 'ATIVA') {
      updateData.periodoInicio = new Date()
      // periodoFim is always 30 days for monthly plans; annual billing is handled by MP renewal events
      updateData.periodoFim = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }

    await prisma.assinatura.update({ where: { id: assinatura.id }, data: updateData })

    const nomePlano = assinatura.plano.nome
    if (novoStatus === 'ATIVA' && assinatura.status !== 'ATIVA') {
      notificacaoService.dispatch(
        assinatura.usuarioId,
        'ASSINATURA_RENOVADA',
        'Assinatura ativada ✅',
        `Sua assinatura do plano ${nomePlano} está ativa e válida por 30 dias.`,
      )
    } else if (novoStatus === 'CANCELADA') {
      notificacaoService.dispatch(
        assinatura.usuarioId,
        'ASSINATURA_CANCELADA',
        'Assinatura cancelada',
        `Sua assinatura do plano ${nomePlano} foi cancelada.`,
      )
    } else if (novoStatus === 'PAUSADA') {
      notificacaoService.dispatch(
        assinatura.usuarioId,
        'ASSINATURA_PAUSADA',
        'Assinatura pausada',
        `Sua assinatura do plano ${nomePlano} foi pausada.`,
      )
    }
  }
}

const _svc = new AssinaturaService()
export const getMinhaAssinatura = (...args: Parameters<AssinaturaService['getMinhaAssinatura']>) => _svc.getMinhaAssinatura(...args)
export const criarAssinatura = (...args: Parameters<AssinaturaService['criarAssinatura']>) => _svc.criarAssinatura(...args)
export const cancelarAssinatura = (...args: Parameters<AssinaturaService['cancelarAssinatura']>) => _svc.cancelarAssinatura(...args)
export const handleWebhookAssinatura = (...args: Parameters<AssinaturaService['handleWebhookAssinatura']>) => _svc.handleWebhookAssinatura(...args)
