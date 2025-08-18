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
import {
  formatCurrency,
  formatDate,
} from '@viu/shared'

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
}

/**
 * Serviço responsável por operações relacionadas a projetos.
 */
export class ProjetoService {
  /**
   * Lista projetos com filtros e paginação.
   */
  async listProjetos({
    page = 1,
    limit = 10,
    status,
    designerId,
    clienteId,
    search,
  }: ListProjetosParams) {
    const skip = (page - 1) * limit

    const where: any = {
      ...(status && { status }),
      ...(designerId && { designerId }),
      ...(clienteId && { clienteId }),
      ...(search && {
        OR: [
          { nome: { contains: search } },
          { descricao: { contains: search } },
        ],
      }),
    }

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
      }),
      prisma.projeto.count({ where }),
    ])

    // Formatar dados
    const projetosFormatados = projetos.map((projeto: any) => ({
      ...projeto,
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
    // Verificar se designer e cliente existem e estão ativos
    const [designer, cliente] = await Promise.all([
      prisma.usuario.findUnique({
        where: { id: projetoData.designerId, tipo: 'DESIGNER', ativo: true },
      }),
      prisma.usuario.findUnique({
        where: { id: projetoData.clienteId, tipo: 'CLIENTE', ativo: true },
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