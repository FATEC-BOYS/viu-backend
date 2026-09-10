import prisma from '../database/client.js'
import { assertValidTransition, APROVACAO_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'

export interface ListAprovacoesParams {
  page?: number
  limit?: number
  arteId?: string
  aprovadorId?: string
  status?: string
  // filtro pedido pelo cliente da API
  projetoId?: string
  // access-control scope (set by controller for non-admins)
  projetoIds?: string[]
}

export class AprovacaoService {
  async listAprovacoes({
    page = 1,
    limit = 10,
    arteId,
    aprovadorId,
    status,
    projetoId,
    projetoIds,
  }: ListAprovacoesParams) {
    const skip = (page - 1) * limit

    // projetoId (filtro do chamador) e projetoIds (escopo de acesso) são
    // acumulativos: pedir um projeto específico nunca amplia o que o não-admin
    // pode ver.
    const arteConditions: any[] = []
    if (projetoId) arteConditions.push({ projetoId })
    if (projetoIds) arteConditions.push({ projetoId: { in: projetoIds } })

    const where: any = {
      deletedAt: null,
      ...(arteId && { arteId }),
      ...(aprovadorId && { aprovadorId }),
      ...(status && { status }),
      ...(arteConditions.length > 0 && {
        arte: arteConditions.length === 1 ? arteConditions[0] : { AND: arteConditions },
      }),
    }
    const [aprovacoes, total] = await Promise.all([
      prisma.aprovacao.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          arte: { select: { id: true, nome: true, versao: true, projetoId: true, arquivo: true } },
          aprovador: { select: { id: true, nome: true, avatar: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.aprovacao.count({ where }),
    ])
    return { aprovacoes, total }
  }

  async getAprovacaoById(id: string, requesterId: string, isAdmin: boolean) {
    const aprovacao = await prisma.aprovacao.findUnique({
      where: { id, deletedAt: null },
      include: {
        arte: { select: { id: true, nome: true, projetoId: true, projeto: { select: { designerId: true, clienteId: true } } } },
        aprovador: { select: { id: true, nome: true, avatar: true } },
      },
    })
    if (!aprovacao) return null
    if (!isAdmin) {
      const proj = aprovacao.arte?.projeto
      if (!proj || (proj.designerId !== requesterId && proj.clienteId !== requesterId)) {
        throw new Error('Acesso negado')
      }
    }
    return aprovacao
  }

  async createAprovacao(data: {
    arteId: string
    status: string
    comentario?: string
    aprovadorId: string
    versaoNumero?: number | null
  }) {
    const arte = await prisma.arte.findUnique({
      where: { id: data.arteId },
      include: {
        projeto: { select: { clienteId: true, designerId: true } },
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    // Only the client of the project can approve/reject
    if (arte.projeto.clienteId !== data.aprovadorId) {
      throw new Error('Apenas o cliente do projeto pode aprovar ou rejeitar artes')
    }
    // Designer cannot approve their own work
    if (arte.autorId === data.aprovadorId) {
      throw new Error('O autor não pode aprovar a própria arte')
    }

    const aprovacao = await prisma.aprovacao.create({
      data: {
        arteId: data.arteId,
        status: data.status,
        comentario: data.comentario,
        aprovadorId: data.aprovadorId,
        versaoNumero: data.versaoNumero ?? arte.versao,
      },
    })

    // Notify the designer of the decision
    if (arte.autorId && (data.status === 'APROVADO' || data.status === 'REJEITADO')) {
      const statusLabel = data.status === 'APROVADO' ? 'aprovada ✅' : 'rejeitada ❌'
      notificacaoService.dispatch(
        arte.autorId,
        data.status === 'APROVADO' ? 'ARTE_APROVADA' : 'ARTE_REJEITADA',
        `Arte ${statusLabel}`,
        `A arte "${arte.nome}" foi ${statusLabel} pelo cliente.${data.comentario ? ` Comentário: ${data.comentario}` : ''}`,
      )
    }

    return aprovacao
  }

  /**
   * O designer pede a decisão; o cliente decide.
   *
   * `POST /aprovacoes` não serve para isso: o controller força
   * `aprovadorId = usuario.id` e a rota exige APROVAR_ARTE, que o designer não
   * tem. Aquela rota é "o cliente registra a própria decisão" — o sentido
   * oposto. Ampliá-la significaria aceitar `aprovadorId` do body de novo.
   */
  async solicitarAprovacao(arteId: string, solicitanteId: string, versaoNumero?: number | null) {
    const arte = await prisma.arte.findUnique({
      where: { id: arteId },
      include: { projeto: { select: { clienteId: true, designerId: true } } },
    })
    if (!arte) throw new Error('Arte não encontrada')

    if (arte.projeto.designerId !== solicitanteId) {
      throw new Error('Acesso negado: apenas o designer do projeto pode solicitar aprovação')
    }

    const versao = versaoNumero ?? arte.versao

    // Reaproveita a pendência em vez de criar outra. Dois cliques em
    // "Solicitar" criariam duas linhas, e a rota de decisão — que busca com
    // limit=1 e pega [0] — aplicaria a resposta do cliente numa arbitrária.
    const existente = await prisma.aprovacao.findFirst({
      where: {
        arteId,
        aprovadorId: arte.projeto.clienteId,
        versaoNumero: versao,
        status: 'PENDENTE',
        deletedAt: null,
      },
    })
    if (existente) return existente

    const aprovacao = await prisma.aprovacao.create({
      data: {
        arteId,
        aprovadorId: arte.projeto.clienteId,
        status: 'PENDENTE',
        versaoNumero: versao,
      },
    })

    notificacaoService.dispatch(
      arte.projeto.clienteId,
      'APROVACAO_SOLICITADA',
      `"${arte.nome}" aguarda sua aprovação`,
      `A versão ${versao} de "${arte.nome}" foi enviada para sua aprovação.`,
    )

    return aprovacao
  }

  async updateAprovacao(id: string, updateData: { status?: string; comentario?: string }, userId: string) {
    const existing = await prisma.aprovacao.findUnique({
      where: { id, deletedAt: null },
      include: { arte: { include: { projeto: { select: { clienteId: true } } } } },
    })
    if (!existing) throw new Error('Aprovação não encontrada')

    // Only the original approver (client) can update
    if (existing.aprovadorId !== userId) {
      throw new Error('Acesso negado: apenas o aprovador original pode atualizar esta aprovação')
    }

    const allowedUpdate: Record<string, any> = {}
    if (updateData.status !== undefined) {
      assertValidTransition('Aprovação', APROVACAO_TRANSITIONS, existing.status, updateData.status)
      allowedUpdate.status = updateData.status
      // Carimba a saída de PENDENTE. É o único momento em que a decisão
      // acontece — a máquina de estados não permite voltar — e sem isto não há
      // como medir quanto tempo o cliente levou para responder, que é
      // exatamente o que o produto promete encurtar.
      allowedUpdate.decididoEm = new Date()
    }
    if (updateData.comentario !== undefined) allowedUpdate.comentario = updateData.comentario

    return prisma.aprovacao.update({ where: { id }, data: allowedUpdate })
  }

  async deleteAprovacao(id: string, userId: string, isAdmin: boolean) {
    const existing = await prisma.aprovacao.findUnique({ where: { id, deletedAt: null } })
    if (!existing) throw new Error('Aprovação não encontrada')

    if (!isAdmin && existing.aprovadorId !== userId) {
      throw new Error('Acesso negado: você não pode excluir esta aprovação')
    }

    await prisma.aprovacao.update({ where: { id }, data: { deletedAt: new Date() } })
  }

  /**
   * Cutuca o aprovador de uma aprovação ainda pendente.
   *
   * Só notifica — nada de alterar o estado da aprovação. Quem lembra precisa
   * ser designer ou cliente do projeto, e aprovação já respondida não gera
   * lembrete.
   */
  async lembrarAprovador(id: string, solicitanteId: string) {
    const aprovacao = await prisma.aprovacao.findUnique({
      where: { id, deletedAt: null },
      include: {
        arte: {
          select: {
            nome: true,
            projeto: { select: { designerId: true, clienteId: true } },
          },
        },
      },
    })
    if (!aprovacao) throw new Error('Aprovação não encontrada')

    const proj = aprovacao.arte.projeto
    if (solicitanteId !== proj.designerId && solicitanteId !== proj.clienteId) {
      throw new Error('Acesso negado')
    }
    if (aprovacao.status !== 'PENDENTE') throw new Error('Aprovação já respondida')

    notificacaoService.dispatch(
      aprovacao.aprovadorId,
      'LEMBRETE_APROVACAO',
      `Lembrete: "${aprovacao.arte.nome}" aguarda sua aprovação`,
      `A arte "${aprovacao.arte.nome}" continua pendente de aprovação.`,
    )

    return { aprovacaoId: aprovacao.id, aprovadorId: aprovacao.aprovadorId }
  }
}
