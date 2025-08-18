// src/services/arteService.ts
/**
 * Serviço para Artes
 *
 * Responsável por operações de CRUD nas artes/arquivos associados aos
 * projetos. Inclui validação de relacionamento com projetos e usuários
 * (autor) e suporta filtros de listagem básicos.
 */

import prisma from '../database/client.js'

export interface ListArtesParams {
  page?: number
  limit?: number
  projetoId?: string
  autorId?: string
  status?: string
  tipo?: string
  search?: string
}

export class ArteService {
  /**
   * Lista artes com filtros opcionais e paginação.
   */
  async listArtes({
    page = 1,
    limit = 10,
    projetoId,
    autorId,
    status,
    tipo,
    search,
  }: ListArtesParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(projetoId && { projetoId }),
      ...(autorId && { autorId }),
      ...(status && { status }),
      ...(tipo && { tipo }),
      ...(search && { nome: { contains: search } }),
    }
    const [artes, total] = await Promise.all([
      prisma.arte.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          autor: {
            select: { id: true, nome: true, avatar: true },
          },
          projeto: {
            select: { id: true, nome: true },
          },
          _count: {
            select: { feedbacks: true, aprovacoes: true },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.arte.count({ where }),
    ])
    return { artes, total }
  }

  /**
   * Busca uma arte por ID, incluindo relacionamentos principais.
   */
  async getArteById(id: string) {
    const arte = await prisma.arte.findUnique({
      where: { id },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        projeto: { select: { id: true, nome: true } },
        feedbacks: {
          include: {
            autor: { select: { id: true, nome: true, avatar: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
        aprovacoes: {
          include: {
            aprovador: { select: { id: true, nome: true, avatar: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
      },
    })
    return arte
  }

  /**
   * Cria uma nova arte. Verifica se o projeto e o autor existem.
   * @throws Error quando projeto ou autor não existirem.
   */
  async createArte(data: any) {
    const [projeto, autor] = await Promise.all([
      prisma.projeto.findUnique({ where: { id: data.projetoId } }),
      prisma.usuario.findUnique({ where: { id: data.autorId } }),
    ])
    if (!projeto) {
      throw new Error('Projeto não encontrado')
    }
    if (!autor) {
      throw new Error('Autor não encontrado')
    }
    const arte = await prisma.arte.create({ data })
    return arte
  }

  /**
   * Atualiza uma arte existente.
   * @throws Error se a arte não for encontrada.
   */
  async updateArte(id: string, updateData: any) {
    const existingArte = await prisma.arte.findUnique({ where: { id } })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    const arte = await prisma.arte.update({ where: { id }, data: updateData })
    return arte
  }

  /**
   * Remove uma arte do banco.
   * @throws Error se a arte não for encontrada.
   */
  async deleteArte(id: string) {
    const existingArte = await prisma.arte.findUnique({ where: { id } })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    await prisma.arte.delete({ where: { id } })
    return
  }
}