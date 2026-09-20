import prisma from '../database/client.js'
import { mpPreApproval } from './mercadoPagoService.js'
import { ASSINATURA_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'
import { env } from '../config/env.js'
import { planoGratuitoDoDesigner } from './planoGratuito.js'
import { assinaturaVigente } from './assinaturaVigente.js'

const MP_STATUS_MAP: Record<string, string> = {
  authorized: 'ATIVA',
  pending: 'PENDENTE',
  paused: 'PAUSADA',
  cancelled: 'CANCELADA',
}

export class AssinaturaService {
  /**
   * O que vale para esta pessoa — a assinatura, se houver, e o plano em vigor.
   *
   * Antes devolvia só a linha, e `null` quando não havia nenhuma. A tela lia
   * esse `null` como "não tem plano" e mostrava "Você ainda não tem uma
   * assinatura ativa" com um convite para escolher um plano — inclusive para
   * quem acabara de cancelar e para todo designer cadastrado antes de o
   * produto passar a criar a linha do Gratuito. O resto do sistema já os
   * tratava como assinantes do Gratuito; só esta rota discordava.
   */
  async getMinhaAssinatura(usuarioId: string) {
    return assinaturaVigente(usuarioId)
  }

  /**
   * Põe o designer no plano gratuito, no cadastro.
   *
   * O produto já tratava a ausência de assinatura como "está no gratuito" na
   * hora de calcular a taxa da fatura. Só que a tela não sabia disso: o Perfil
   * mostrava "Nenhuma assinatura ativa" para todo designer do VIU, com um
   * botão para escolher um plano que ele já tinha. E o teto de projetos e
   * artes vinha de outro lugar (as variáveis BETA_MAX), então mudar os limites
   * do Gratuito na tela de administração não mudava limite nenhum.
   *
   * Com a linha criada, as três coisas passam a ler o mesmo lugar.
   *
   * Devolve `null` em vez de estourar quando não há plano gratuito cadastrado
   * ou quando o designer já assina algo: nenhum dos dois é motivo para recusar
   * um cadastro, e a taxa continua tendo a saída do `faturaService`.
   */
  async assinarPlanoGratuito(usuarioId: string) {
    const plano = await planoGratuitoDoDesigner()
    if (!plano) return null

    const jaTem = await prisma.assinatura.findFirst({
      where: { usuarioId, status: { in: ['ATIVA', 'PENDENTE'] } },
    })
    if (jaTem) return null

    return prisma.assinatura.create({
      data: { usuarioId, planoId: plano.id, status: 'ATIVA', periodoInicio: new Date() },
      include: { plano: true },
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

    // A cobrança recorrente para no gateway de qualquer forma: o que se
    // decide aqui embaixo é só até quando o acesso já pago continua valendo.
    if (assinatura.mpPreapprovalId) {
      await mpPreApproval.update({
        id: assinatura.mpPreapprovalId,
        body: { status: 'cancelled' },
      })
    }

    /*
     * Cancelar desliga a renovação; não confisca o que já foi pago.
     *
     * Escrevia `CANCELADA` na hora, e como `taxaDoDesigner` e
     * `requirePlanLimit` só enxergam `ATIVA`, o acesso caía no mesmo segundo.
     * Conferido no app: com 27 dias pagos pela frente, `POST /projetos` passou
     * de aceito para `402 "Você chegou ao limite do beta: 3 projetos"` logo
     * depois do clique — enquanto o diálogo prometia, com todas as letras,
     * "você perderá acesso ao final do período pago".
     *
     * Agora a linha continua `ATIVA` com `renovacaoAutomatica: false` até
     * `periodoFim`, e `assinaturaVigente` a vence quando a data chega. Sem
     * período pago pela frente — plano gratuito, ou assinatura que nunca
     * chegou a ter data — não há o que preservar e ela encerra na hora.
     */
    const aindaPago = assinatura.periodoFim !== null && assinatura.periodoFim > new Date()

    return prisma.assinatura.update({
      where: { id },
      data: aindaPago
        ? { renovacaoAutomatica: false }
        : { status: 'CANCELADA', renovacaoAutomatica: false },
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
        { entidadeTipo: 'ASSINATURA', entidadeId: assinatura.id },
      )
    } else if (novoStatus === 'CANCELADA') {
      notificacaoService.dispatch(
        assinatura.usuarioId,
        'ASSINATURA_CANCELADA',
        'Assinatura cancelada',
        `Sua assinatura do plano ${nomePlano} foi cancelada.`,
        { entidadeTipo: 'ASSINATURA', entidadeId: assinatura.id },
      )
    } else if (novoStatus === 'PAUSADA') {
      notificacaoService.dispatch(
        assinatura.usuarioId,
        'ASSINATURA_PAUSADA',
        'Assinatura pausada',
        `Sua assinatura do plano ${nomePlano} foi pausada.`,
        { entidadeTipo: 'ASSINATURA', entidadeId: assinatura.id },
      )
    }
  }
}

const _svc = new AssinaturaService()
export const getMinhaAssinatura = (...args: Parameters<AssinaturaService['getMinhaAssinatura']>) => _svc.getMinhaAssinatura(...args)
export const criarAssinatura = (...args: Parameters<AssinaturaService['criarAssinatura']>) => _svc.criarAssinatura(...args)
export const assinarPlanoGratuito = (...args: Parameters<AssinaturaService['assinarPlanoGratuito']>) => _svc.assinarPlanoGratuito(...args)
export const cancelarAssinatura = (...args: Parameters<AssinaturaService['cancelarAssinatura']>) => _svc.cancelarAssinatura(...args)
export const handleWebhookAssinatura = (...args: Parameters<AssinaturaService['handleWebhookAssinatura']>) => _svc.handleWebhookAssinatura(...args)
