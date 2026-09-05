// src/services/arteService.ts
/**
 * Serviço para Artes
 *
 * Responsável por operações de CRUD nas artes/arquivos associados aos
 * projetos. Inclui validação de relacionamento com projetos e usuários
 * (autor) e suporta filtros de listagem básicos.
 */

import prisma from '../database/client.js'
import { assertValidTransition, ARTE_TRANSITIONS } from '../utils/stateMachine.js'
import { PROJETO_ACCESS_SELECT, assertAcessoAoProjeto } from '../utils/projectAccess.js'

export interface ListArtesParams {
  page?: number
  limit?: number
  projetoId?: string
  projetoIds?: string[] // access-control scope (set by controller for non-admins)
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
    projetoIds,
    autorId,
    status,
    tipo,
    search,
  }: ListArtesParams) {
    const skip = (page - 1) * limit
    // projetoId (filtro de quem chama) e projetoIds (escopo de acesso) são
    // acumulativos. Antes o filtro *substituía* o escopo — pedir um projeto
    // específico apagava a restrição de acesso, e o service só não vazava
    // porque o controller conferia antes. Agora a listagem é segura sozinha,
    // como já era em aprovacaoService e feedbackService.
    const projetoConditions: any[] = []
    if (projetoId) projetoConditions.push({ projetoId })
    if (projetoIds) projetoConditions.push({ projetoId: { in: projetoIds } })

    const where: any = {
      ...(projetoConditions.length === 1 && projetoConditions[0]),
      ...(projetoConditions.length > 1 && { AND: projetoConditions }),
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
   *
   * `requesterId` não é opcional de propósito: até então a autorização desta
   * operação vivia inteira no middleware da rota, e um furo lá (ver
   * requireProjectAccess) virava escrita em arte de outro tenant. Agora o
   * service é a autoridade final e não depende de quem o chama.
   *
   * @throws Error se a arte não for encontrada ou o requisitante não tiver acesso.
   */
  async updateArte(id: string, updateData: any, requesterId: string, isAdmin = false) {
    const existingArte = await prisma.arte.findUnique({
      where: { id },
      include: { projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    assertAcessoAoProjeto(existingArte.projeto, requesterId, isAdmin)

    if (updateData.status && updateData.status !== existingArte.status) {
      assertValidTransition('Arte', ARTE_TRANSITIONS, existingArte.status, updateData.status)
    }

    const arte = await prisma.arte.update({ where: { id }, data: updateData })
    return arte
  }

  /**
   * Remove uma arte do banco.
   * @throws Error se a arte não for encontrada ou o requisitante não tiver acesso.
   */
  async deleteArte(id: string, requesterId: string, isAdmin = false) {
    const existingArte = await prisma.arte.findUnique({
      where: { id },
      include: { projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    assertAcessoAoProjeto(existingArte.projeto, requesterId, isAdmin)

    await prisma.arte.delete({ where: { id } })
    return
  }
}