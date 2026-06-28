import prisma from '../database/client.js'
import { mpPreApproval } from './mercadoPagoService.js'
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
    const status = MP_STATUS_MAP[preapproval.status ?? ''] ?? 'PENDENTE'

    await prisma.assinatura.updateMany({
      where: { mpPreapprovalId: preapprovalId },
      data: {
        status,
        ...(status === 'ATIVA' ? { periodoInicio: new Date() } : {}),
      },
    })
  }
}
