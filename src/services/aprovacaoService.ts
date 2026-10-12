import prisma from '../database/client.js'
import { assertValidTransition, APROVACAO_TRANSITIONS, ARTE_TRANSITIONS } from '../utils/stateMachine.js'
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

/**
 * Recusar sem dizer o que mudar não é uma decisão — é silêncio com carimbo.
 *
 * O produto inteiro existe para encurtar a volta entre "não gostei" e a
 * próxima versão. Uma linha REJEITADO sem `comentario` devolve ao designer
 * exatamente o que ele já tinha antes de pedir a aprovação: nada acionável.
 *
 * A regra mora aqui, e não no formulário, porque a tela não é o único caminho
 * até esta função — `PUT /aprovacoes/:id` aceita chamada direta.
 */
export class RecusaSemMotivoError extends Error {
  readonly codigo = 'RECUSA_SEM_MOTIVO'
  constructor() {
    super('Diga o que precisa mudar para recusar esta versão.')
    this.name = 'RecusaSemMotivoError'
  }
}

/**
 * Pedir aprovação de uma versão que o cliente JÁ decidiu.
 *
 * `solicitarAprovacao` reaproveitava a pendência buscando por
 * `status: 'PENDENTE'`, mas a restrição do banco é
 * `@@unique([arteId, aprovadorId, versaoNumero])` — sem olhar status. Com a
 * versão já aprovada ou recusada, a busca não achava nada e o `create` batia
 * na restrição: Prisma P2002, 500, e a tela dizendo "Erro ao solicitar
 * aprovação" sem motivo nenhum. Reproduzido pedindo, aprovando e pedindo de
 * novo a mesma versão.
 *
 * As duas definições de "já existe" discordavam. Agora a busca é pela chave
 * inteira, e o caso decidido tem resposta própria: a máquina de estados não
 * deixa redecidir uma versão, então o caminho é mandar outra.
 */
export class VersaoJaDecididaError extends Error {
  readonly codigo = 'VERSAO_JA_DECIDIDA'
  constructor(versao: number | null, status: string, quando: Date | null) {
    const rotulo = status === 'APROVADO' ? 'aprovada' : 'recusada'
    const data = quando
      ? ` em ${quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      : ''
    super(
      `A v${versao ?? 1} já foi ${rotulo} pelo cliente${data}. ` +
        `Envie uma nova versão para pedir outra aprovação.`,
    )
    this.name = 'VersaoJaDecididaError'
  }
}

/**
 * A decisão do cliente move a arte.
 *
 * `arte.status` e a aprovação eram dois registros do mesmo fato, e ninguém
 * ligava um ao outro: o cliente aprovava e a arte continuava onde o designer
 * a tinha deixado. Daí três telas respondendo coisas diferentes sobre o mesmo
 * evento — medido no app, com uma arte decidida pelo cliente:
 *
 *   cartão em Projetos   lê `arte.status`   "0 de 1 aprovadas"
 *   detalhe da arte      lê a aprovação     "Aprovada · v1"
 *   cabeçalho do viewer  lê `arte.status`   "Recusada"
 *
 * A máquina de estados já previa este movimento — `EM_ANALISE` sai para
 * `APROVADO` ou `REJEITADO` — e simplesmente não havia quem o conduzisse.
 *
 * Quando a transição NÃO é permitida, a arte fica como está. `REJEITADO →
 * APROVADO` é o caso: a máquina exige passar por `EM_ANALISE`, que é o que
 * acontece quando o designer manda a versão nova. Forçar o pulo aqui apagaria
 * a recusa do histórico, que num produto com disputa é justamente o que não
 * se pode perder.
 *
 * A decisão já está gravada quando isto roda: se mover a arte falhar, o
 * registro continua de pé. Por isso a falha é anotada e não derruba a
 * resposta — era a decisão que o cliente pediu, não o rótulo.
 */
async function moverArtePelaDecisao(
  arteId: string,
  decisao: 'APROVADO' | 'REJEITADO',
  versaoDecidida: number | null,
) {
  try {
    const arte = await prisma.arte.findUnique({
      where: { id: arteId },
      select: { status: true, versao: true },
    })
    if (!arte) return

    /*
     * Só a decisão da versão CORRENTE move o rótulo.
     *
     * `Arte.versao` é um ponteiro para a entrega atual, e `criarVersao` o
     * avança. Então o cliente pode ter uma pendência aberta na v1 quando o
     * designer já subiu a v2: respondida tarde, aquela decisão é sobre a v1, e
     * carimbá-la na arte diria sobre a v2 algo que ninguém falou dela.
     *
     * A aprovação da v1 continua gravada e visível no histórico — o que não
     * acontece é ela reescrever o estado de uma entrega que o cliente não viu.
     */
    if (versaoDecidida !== null && versaoDecidida !== arte.versao) return

    const permitidos = ARTE_TRANSITIONS[arte.status] ?? []
    if (!permitidos.includes(decisao)) return
    await prisma.arte.update({ where: { id: arteId }, data: { status: decisao } })
  } catch {
    // A decisão vale mesmo que o rótulo não acompanhe.
  }
}

function motivoAusente(comentario?: string | null): boolean {
  return !comentario || comentario.trim().length === 0
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
          arte: {
            select: {
              id: true,
              nome: true,
              versao: true,
              projetoId: true,
              arquivo: true,
              // O nome do projeto: a fila do cliente mistura trabalhos de
              // designers diferentes, e "Logo v1" sozinho não diz de qual.
              projeto: { select: { nome: true } },
            },
          },
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

    if (data.status === 'REJEITADO' && motivoAusente(data.comentario)) {
      throw new RecusaSemMotivoError()
    }

    /*
     * Esta linha já nasce decidida?
     *
     * A pergunta era feita duas vezes neste método — uma aqui, implícita, e
     * outra logo abaixo para decidir se avisa o designer — e só a de baixo
     * existia. O resultado: a aprovação era criada com status terminal, o
     * designer recebia "Arte aprovada ✅", e `decididoEm` ficava nulo.
     *
     * `decididoEm` é o carimbo de QUANDO a decisão aconteceu, e três lugares
     * o leem: a faixa "esta semana" do dashboard, o resumo do admin, e o
     * funil — que mede quanto tempo o cliente levou para responder, que é o
     * número que o produto promete encurtar. Nulo, a decisão simplesmente não
     * conta em nenhum dos três.
     *
     * Medido: com duas aprovações APROVADO no mesmo dia, uma criada por aqui e
     * outra decidida por `PUT /aprovacoes/:id` (que já carimbava), o feed do
     * dashboard mostrava as duas e o contador ao lado dizia 1.
     *
     * Com um nome só, os dois usos não têm de onde divergir.
     */
    const jaDecidida = data.status === 'APROVADO' || data.status === 'REJEITADO'

    const aprovacao = await prisma.aprovacao.create({
      data: {
        arteId: data.arteId,
        status: data.status,
        comentario: data.comentario,
        aprovadorId: data.aprovadorId,
        versaoNumero: data.versaoNumero ?? arte.versao,
        // Criada já decidida: a decisão aconteceu agora. PENDENTE fica sem
        // carimbo, que é o certo — ela ainda não foi decidida.
        decididoEm: jaDecidida ? new Date() : null,
      },
    })

    if (jaDecidida) {
      await moverArtePelaDecisao(
        data.arteId,
        data.status as 'APROVADO' | 'REJEITADO',
        data.versaoNumero ?? arte.versao,
      )
    }

    // Notify the designer of the decision
    if (arte.autorId && jaDecidida) {
      const statusLabel = data.status === 'APROVADO' ? 'aprovada ✅' : 'rejeitada ❌'
      notificacaoService.dispatch(
        arte.autorId,
        data.status === 'APROVADO' ? 'ARTE_APROVADA' : 'ARTE_REJEITADA',
        `Arte ${statusLabel}`,
        `A arte "${arte.nome}" foi ${statusLabel} pelo cliente.${data.comentario ? ` Comentário: ${data.comentario}` : ''}`,
        { entidadeTipo: 'ARTE', entidadeId: arte.id },
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
    /*
     * Busca pela MESMA chave que a restrição do banco usa — sem filtrar
     * status. Filtrar por `PENDENTE` fazia a função concluir "não existe" para
     * uma linha que existe, e o `create` seguinte estourava. Ver
     * `VersaoJaDecididaError`.
     */
    const existente = await prisma.aprovacao.findFirst({
      where: {
        arteId,
        aprovadorId: arte.projeto.clienteId,
        versaoNumero: versao,
        deletedAt: null,
      },
    })
    if (existente) {
      // Pendência aberta: dois cliques em "Solicitar" devolvem a mesma linha,
      // que é o que esta busca sempre existiu para garantir.
      if (existente.status === 'PENDENTE') return existente
      throw new VersaoJaDecididaError(versao, existente.status, existente.decididoEm)
    }

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
      { entidadeTipo: 'ARTE', entidadeId: arte.id },
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
      // `?? existing.comentario`: quem já escreveu o motivo antes de decidir
      // não precisa reescrevê-lo junto com o status.
      if (
        updateData.status === 'REJEITADO' &&
        motivoAusente(updateData.comentario ?? existing.comentario)
      ) {
        throw new RecusaSemMotivoError()
      }
      allowedUpdate.status = updateData.status
      // Carimba a saída de PENDENTE. É o único momento em que a decisão
      // acontece — a máquina de estados não permite voltar — e sem isto não há
      // como medir quanto tempo o cliente levou para responder, que é
      // exatamente o que o produto promete encurtar.
      allowedUpdate.decididoEm = new Date()
    }
    if (updateData.comentario !== undefined) allowedUpdate.comentario = updateData.comentario

    const atualizada = await prisma.aprovacao.update({ where: { id }, data: allowedUpdate })

    if (allowedUpdate.status === 'APROVADO' || allowedUpdate.status === 'REJEITADO') {
      await moverArtePelaDecisao(existing.arteId, allowedUpdate.status, existing.versaoNumero)
    }

    /*
     * Avisa o designer de que o cliente respondeu.
     *
     * Este aviso existia só em `createAprovacao` — o caminho em que o cliente
     * registra uma decisão do zero. O produto decide por aqui: o designer pede
     * com `solicitarAprovacao`, e a tela do cliente responde com
     * `PUT /aprovacoes/:id`. Resultado: no laço central do VIU, o designer
     * nunca ficava sabendo que a arte foi aprovada ou recusada. Conferido no
     * app — pedir e aprovar deixava a caixa de entrada do designer intacta.
     *
     * `existing.arte.autorId` e não o designer do projeto: quem espera a
     * resposta é quem mandou a arte, que num time pode não ser o dono da conta.
     */
    if (
      existing.arte?.autorId &&
      (allowedUpdate.status === 'APROVADO' || allowedUpdate.status === 'REJEITADO')
    ) {
      const aprovada = allowedUpdate.status === 'APROVADO'
      // O emoji fica no título, onde marca a linha de relance. No meio da
      // frase ele só atravessa a leitura: "foi aprovada ✅ pelo cliente".
      const statusLabel = aprovada ? 'aprovada' : 'recusada'
      const comentario = allowedUpdate.comentario ?? existing.comentario
      notificacaoService.dispatch(
        existing.arte.autorId,
        aprovada ? 'ARTE_APROVADA' : 'ARTE_REJEITADA',
        `Arte ${statusLabel} ${aprovada ? '✅' : '❌'}`,
        `A arte "${existing.arte.nome}" foi ${statusLabel} pelo cliente.${comentario ? ` Comentário: ${comentario}` : ''}`,
        { entidadeTipo: 'ARTE', entidadeId: existing.arteId },
      )
    }

    return atualizada
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
      { entidadeTipo: 'ARTE', entidadeId: aprovacao.arteId },
    )

    return { aprovacaoId: aprovacao.id, aprovadorId: aprovacao.aprovadorId }
  }
}
