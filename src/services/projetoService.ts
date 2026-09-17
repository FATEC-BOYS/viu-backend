// src/services/projetoService.ts
/**
 * Serviço de Projetos
 *
 * Esta camada encapsula toda a lógica de negócios e o acesso ao banco de
 * dados relacionada aos projetos. Separar a lógica de negócios em um
 * serviço dedicado facilita a manutenção, teste e reutilização em diferentes
 * partes da aplicação.
 */

import prisma from '../database/client.js'
import { assertValidTransition, PROJETO_TRANSITIONS } from '../utils/stateMachine.js'
import {
  formatCurrency,
  formatDate,
} from '../utils/formatters.js'

// equipeId is organizational only and does not grant project access
const EQUIPE_SELECT = { select: { id: true, nome: true, slug: true } } as const

/**
 * Tipagem para os filtros de listagem de projetos.
 */
export interface ListProjetosParams {
  page?: number
  limit?: number
  status?: string
  designerId?: string
  clienteId?: string
  search?: string
  // When set, restricts to projects where this user is designer OR client (non-admin path)
  userId?: string
}

/**
 * Serviço responsável por operações relacionadas a projetos.
 */
/**
 * O cliente escolhido não serve para este projeto — e o motivo não é "não
 * existe".
 *
 * Erro com `codigo` em vez de frase: o controller mapeia status por
 * `includes('não encontrado')`, e o dia em que alguém reescrever a mensagem
 * o 400 vira 500 sem ninguém perceber. Já aconteceu aqui com o contrato.
 */
export class ClienteInvalidoError extends Error {
  readonly codigo = 'CLIENTE_INVALIDO'
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ClienteInvalidoError'
  }
}

export class ProjetoService {
  async listProjetos({
    page = 1,
    limit = 10,
    status,
    designerId,
    clienteId,
    search,
    userId,
  }: ListProjetosParams) {
    const skip = (page - 1) * limit

    // Build conditions as an AND array so OR clauses don't collide
    const conditions: any[] = []
    if (userId) {
      conditions.push({ OR: [{ designerId: userId }, { clienteId: userId }] })
    } else {
      if (designerId) conditions.push({ designerId })
      if (clienteId) conditions.push({ clienteId })
    }
    if (status) conditions.push({ status })
    if (search) conditions.push({ OR: [{ nome: { contains: search } }, { descricao: { contains: search } }] })
    const where = conditions.length > 0 ? { AND: conditions } : {}

    const [projetos, total] = await Promise.all([
      prisma.projeto.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          designer: {
            select: {
              id: true,
              nome: true,
              email: true,
              avatar: true,
            },
          },
          cliente: {
            select: {
              id: true,
              nome: true,
              email: true,
              avatar: true,
              // Campos usados pela tela /clientes, que monta a carteira do designer
              // a partir dos próprios projetos (GET /usuarios é restrito a ADMIN).
              telefone: true,
              ativo: true,
              criadoEm: true,
            },
          },
          equipe: EQUIPE_SELECT,
          _count: {
            select: {
              artes: true,
              tarefas: true,
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.projeto.count({ where }),
    ])

    /*
     * Quantas artes já foram aprovadas, por projeto.
     *
     * A barra de progresso da tela de Projetos lia `metricas.aprovadas` e
     * `metricas.totalArtes` — um objeto que NUNCA existiu nesta resposta. O
     * cast `(p as any)` no cartão desligou justamente a checagem que teria
     * pegado isso, e a barra nasceu vazia em todo projeto, para sempre.
     *
     * Um `groupBy` e não um `_count` filtrado: o `_count` já traz o total de
     * artes, e a mesma relação não pode aparecer duas vezes ali com filtros
     * diferentes. Uma consulta a mais, sem N+1.
     */
    const aprovadasPorProjeto = new Map<string, number>()
    if (projetos.length > 0) {
      const grupos = await prisma.arte.groupBy({
        by: ['projetoId'],
        where: { projetoId: { in: projetos.map((p: any) => p.id) }, status: 'APROVADO' },
        _count: { _all: true },
      })
      for (const g of grupos) aprovadasPorProjeto.set(g.projetoId, g._count._all)
    }

    // Formatar dados
    const projetosFormatados = projetos.map((projeto: any) => ({
      ...projeto,
      metricas: {
        totalArtes: projeto._count?.artes ?? 0,
        aprovadas: aprovadasPorProjeto.get(projeto.id) ?? 0,
      },
      orcamentoFormatado: projeto.orcamento
        ? formatCurrency(projeto.orcamento)
        : null,
      prazoFormatado: projeto.prazo ? formatDate(projeto.prazo) : null,
      criadoEmFormatado: formatDate(projeto.criadoEm),
    }))

    return { projetos: projetosFormatados, total }
  }

  /**
   * Busca um projeto por ID com detalhes completos.
   */
  async getProjetoById(id: string) {
    const projeto = await prisma.projeto.findUnique({
      where: { id },
      include: {
        designer: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            avatar: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            avatar: true,
          },
        },
        artes: {
          include: {
            autor: {
              select: {
                id: true,
                nome: true,
                avatar: true,
              },
            },
            _count: {
              select: {
                feedbacks: true,
                aprovacoes: true,
              },
            },
          },
          orderBy: { criadoEm: 'desc' },
        },
        tarefas: {
          include: {
            responsavel: {
              select: {
                id: true,
                nome: true,
                avatar: true,
              },
            },
          },
          orderBy: { criadoEm: 'desc' },
        },
        equipe: EQUIPE_SELECT,
      },
    })

    if (!projeto) {
      return null
    }

    // Formatar dados
    return {
      ...projeto,
      orcamentoFormatado: projeto.orcamento
        ? formatCurrency(projeto.orcamento)
        : null,
      prazoFormatado: projeto.prazo ? formatDate(projeto.prazo) : null,
      criadoEmFormatado: formatDate(projeto.criadoEm),
      artes: projeto.artes.map((arte: any) => ({
        ...arte,
        criadoEmFormatado: formatDate(arte.criadoEm),
      })),
      tarefas: projeto.tarefas.map((tarefa: any) => ({
        ...tarefa,
        prazoFormatado: tarefa.prazo ? formatDate(tarefa.prazo) : null,
        criadoEmFormatado: formatDate(tarefa.criadoEm),
      })),
    }
  }

  /**
   * Cria um novo projeto após validar a existência de designer e cliente.
   * @throws Error caso o designer ou o cliente não exista ou esteja inativo.
   */
  async createProjeto(projetoData: any) {
    /*
     * Ninguém é cliente de si mesmo.
     *
     * Esta guarda é nova porque antes ela era acidental: exigir `tipo:
     * 'DESIGNER'` de um lado e `tipo: 'CLIENTE'` do outro tornava impossível
     * que os dois ids fossem o mesmo. Ao soltar o tipo do cliente, o caso
     * passa a ser alcançável — e um projeto onde a pessoa se aprova sozinha
     * quebra a única coisa que o VIU promete: duas partes, uma decidindo
     * sobre o trabalho da outra.
     */
    if (projetoData.designerId === projetoData.clienteId) {
      throw new ClienteInvalidoError('Você não pode ser o cliente do próprio projeto.')
    }

    const [designer, cliente] = await Promise.all([
      prisma.usuario.findUnique({
        where: { id: projetoData.designerId, tipo: 'DESIGNER', ativo: true },
      }),
      /*
       * Sem `tipo: 'CLIENTE'`.
       *
       * Ser cliente é POSIÇÃO NESTE PROJETO, não tipo de conta. Enquanto a
       * consulta exigia o tipo, um designer nunca podia contratar outro
       * designer — e freelancer contrata freelancer o tempo todo. A conta
       * carrega um `tipo` só, então "ser designer" bloqueava "ser cliente"
       * para sempre, e a saída de quem precisava era abrir uma segunda conta
       * com outro e-mail.
       *
       * O que fica exigido é o que importa de verdade: a conta existe e está
       * ativa. `ativo: false` já cobre conta excluída — `deactivateUsuario`
       * desliga e carimba `excluidoEm` na mesma transação.
       *
       * Isto não abre o projeto para qualquer um: quem é convidado recebe
       * convite e o projeto nasce em RASCUNHO, virando EM_ANDAMENTO só quando
       * a outra parte aceita.
       */
      prisma.usuario.findUnique({
        where: { id: projetoData.clienteId, ativo: true },
      }),
    ])

    if (!designer) {
      throw new Error('Designer não encontrado ou inativo')
    }
    if (!cliente) {
      throw new Error('Cliente não encontrado ou inativo')
    }

    const projeto = await prisma.projeto.create({
      data: projetoData,
      include: {
        designer: {
          select: {
            id: true,
            nome: true,
            email: true,
            avatar: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            avatar: true,
          },
        },
        equipe: EQUIPE_SELECT,
      },
    })

    return {
      ...projeto,
      orcamentoFormatado: projeto.orcamento
        ? formatCurrency(projeto.orcamento)
        : null,
      prazoFormatado: projeto.prazo ? formatDate(projeto.prazo) : null,
    }
  }

  /**
   * Atualiza um projeto existente.
   * @throws Error caso o projeto não exista.
   */
  async updateProjeto(id: string, updateData: any) {
    const existingProject = await prisma.projeto.findUnique({
      where: { id },
    })
    if (!existingProject) {
      throw new Error('Projeto não encontrado')
    }

    if (updateData.status && updateData.status !== existingProject.status) {
      assertValidTransition('Projeto', PROJETO_TRANSITIONS, existingProject.status, updateData.status)
    }

    const projeto = await prisma.projeto.update({
      where: { id },
      data: updateData,
      include: {
        designer: {
          select: {
            id: true,
            nome: true,
            email: true,
            avatar: true,
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            avatar: true,
          },
        },
        equipe: EQUIPE_SELECT,
      },
    })

    return {
      ...projeto,
      orcamentoFormatado: projeto.orcamento
        ? formatCurrency(projeto.orcamento)
        : null,
      prazoFormatado: projeto.prazo ? formatDate(projeto.prazo) : null,
    }
  }

  /**
   * Remove um projeto. Gera erro caso o projeto tenha artes ou tarefas
   * associadas ou não exista.
   */
  async deleteProjeto(id: string) {
    const existingProject = await prisma.projeto.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            artes: true,
            tarefas: true,
          },
        },
      },
    })
    if (!existingProject) {
      throw new Error('Projeto não encontrado')
    }
    if (
      existingProject._count.artes > 0 ||
      existingProject._count.tarefas > 0
    ) {
      throw new Error(
        'Não é possível deletar projeto com artes ou tarefas associadas',
      )
    }

    await prisma.projeto.delete({ where: { id } })
    return
  }

  /**
   * Retorna estatísticas e resumo para dashboard de projetos.
   */
  async dashboardStats() {
    const [
      total,
      emAndamento,
      pausados,
      concluidos,
      cancelados,
      projetosRecentes,
      orcamentoTotal,
    ] = await Promise.all([
      prisma.projeto.count(),
      prisma.projeto.count({ where: { status: 'EM_ANDAMENTO' } }),
      prisma.projeto.count({ where: { status: 'PAUSADO' } }),
      prisma.projeto.count({ where: { status: 'CONCLUIDO' } }),
      prisma.projeto.count({ where: { status: 'CANCELADO' } }),
      prisma.projeto.findMany({
        take: 5,
        include: {
          designer: { select: { nome: true } },
          cliente: { select: { nome: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.projeto.aggregate({
        _sum: { orcamento: true },
        where: { status: { not: 'CANCELADO' } },
      }),
    ])

    return {
      resumo: {
        total,
        porStatus: {
          emAndamento,
          pausados,
          concluidos,
          cancelados,
        },
        orcamentoTotal: orcamentoTotal._sum.orcamento || 0,
        orcamentoTotalFormatado: formatCurrency(
          orcamentoTotal._sum.orcamento || 0,
        ),
      },
      projetosRecentes: projetosRecentes.map((projeto: any) => ({
        ...projeto,
        orcamentoFormatado: projeto.orcamento
          ? formatCurrency(projeto.orcamento)
          : null,
        criadoEmFormatado: formatDate(projeto.criadoEm),
      })),
    }
  }

  /**
   * Lista projetos atribuídos a um designer específico.
   */
  async listProjetosByDesigner(designerId: string, status?: string) {
    const where: any = {
      designerId,
      ...(status && { status }),
    }

    const projetos = await prisma.projeto.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            email: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            artes: true,
            tarefas: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    return projetos.map((projeto: any) => ({
      ...projeto,
      orcamentoFormatado: projeto.orcamento
        ? formatCurrency(projeto.orcamento)
        : null,
      prazoFormatado: projeto.prazo ? formatDate(projeto.prazo) : null,
      criadoEmFormatado: formatDate(projeto.criadoEm),
    }))
  }
}