import prisma from '../database/client.js'
import {
  EntidadeNotificacao,
  ROTULO_NOTIFICACAO,
  TipoNotificacao,
} from '../types/enums.js'

export interface ListNotificacoesParams {
  page?: number
  limit?: number
  usuarioId: string
  tipo?: string
  canal?: string
  lida?: string | boolean
}

/** Para onde a notificação leva. Ausente quando o aviso não tem destino. */
export interface AlvoNotificacao {
  entidadeTipo: EntidadeNotificacao
  entidadeId: string
}

export class NotificacaoService {
  async listNotificacoes({
    page = 1,
    limit = 20,
    usuarioId,
    tipo,
    canal,
    lida,
  }: ListNotificacoesParams) {
    const skip = (page - 1) * limit
    let lidaFilter: boolean | undefined
    if (lida !== undefined) {
      if (typeof lida === 'string') lidaFilter = lida === 'true'
      else lidaFilter = lida
    }
    const where: any = {
      usuarioId,
      ...(tipo && { tipo }),
      ...(canal && { canal }),
      ...(lidaFilter !== undefined && { lida: lidaFilter }),
    }
    const [notificacoes, total, naoLidas] = await Promise.all([
      prisma.notificacao.findMany({
        where,
        skip,
        take: Number(limit),
        /*
         * `id` desempata.
         *
         * Só `criadoEm desc` não é ordem total, e aqui há rajada de verdade: o
         * estorno dispara duas notificações no mesmo instante, uma para cada
         * lado. Sem desempate, duas páginas da mesma consulta podem repetir uma
         * linha e pular outra — e a linha pulada é justamente um aviso que a
         * pessoa nunca vê.
         */
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      }),
      prisma.notificacao.count({ where }),
      prisma.notificacao.count({ where: { usuarioId, lida: false } }),
    ])
    return { notificacoes, total, naoLidas }
  }

  /*
   * As opções de filtro que esta pessoa pode usar — e só elas.
   *
   * A tela trazia a lista de tipos escrita à mão, copiada de um enum que o
   * sistema havia parado de falar: quatro dos seis filtros não casavam com
   * nada e só sabiam devolver lista vazia. Vindo daqui, a opção existe porque
   * existe linha, e o rótulo nasce junto do tipo.
   */
  async facetasDeNotificacoes(usuarioId: string) {
    const [porTipo, porCanal] = await Promise.all([
      prisma.notificacao.groupBy({
        by: ['tipo'],
        where: { usuarioId },
        _count: { _all: true },
        orderBy: { tipo: 'asc' },
      }),
      prisma.notificacao.groupBy({
        by: ['canal'],
        where: { usuarioId },
        _count: { _all: true },
        orderBy: { canal: 'asc' },
      }),
    ])

    return {
      tipos: porTipo.map((t) => ({
        tipo: t.tipo,
        // Linha antiga com tipo que saiu do vocabulário continua legível: sem
        // rótulo declarado, mostra o próprio valor em vez de sumir.
        rotulo: ROTULO_NOTIFICACAO[t.tipo as TipoNotificacao] ?? t.tipo,
        total: t._count._all,
      })),
      canais: porCanal.map((c) => ({ canal: c.canal, total: c._count._all })),
    }
  }

  async getNotificacaoById(id: string, usuarioId: string) {
    const n = await prisma.notificacao.findUnique({ where: { id } })
    if (!n) return null
    if (n.usuarioId !== usuarioId) throw new Error('Acesso negado')
    return n
  }

  async createNotificacao(data: any) {
    const usuario = await prisma.usuario.findUnique({ where: { id: data.usuarioId } })
    if (!usuario) throw new Error('Usuário não encontrado')
    return prisma.notificacao.create({ data })
  }

  async markAsRead(id: string, usuarioId: string, read: boolean) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    if (existing.usuarioId !== usuarioId) throw new Error('Acesso negado')
    return prisma.notificacao.update({ where: { id }, data: { lida: read } })
  }

  async markAllAsRead(usuarioId: string) {
    return prisma.notificacao.updateMany({
      where: { usuarioId, lida: false },
      data: { lida: true },
    })
  }

  async deleteNotificacao(id: string, usuarioId: string) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    if (existing.usuarioId !== usuarioId) throw new Error('Acesso negado')
    await prisma.notificacao.delete({ where: { id } })
  }

  /*
   * Fire-and-forget: nunca é aguardado na chamada — erro vira log, não exceção.
   *
   * `tipo` é `TipoNotificacao` e não `string`. Era `string`, e foi por aí que
   * doze tipos diferentes nasceram sem que ninguém percebesse que o enum
   * declarado só conhecia seis. Agora tipo novo sem entrada no enum não compila.
   */
  dispatch(
    usuarioId: string,
    tipo: TipoNotificacao,
    titulo: string,
    conteudo: string,
    alvo?: AlvoNotificacao,
  ): void {
    prisma.notificacao
      .create({
        data: {
          usuarioId,
          tipo,
          titulo,
          conteudo,
          // `canal` fica com o default do schema: hoje o sistema só entrega
          // dentro do app. Repetir o valor aqui seria fingir uma escolha.
          entidadeTipo: alvo?.entidadeTipo ?? null,
          entidadeId: alvo?.entidadeId ?? null,
        },
      })
      .catch((err) => console.error(`[notificacao] dispatch falhou para ${usuarioId}:`, err))
  }
}

export const notificacaoService = new NotificacaoService()
