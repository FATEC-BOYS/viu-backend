import prisma from '../database/client.js'
import { Prisma } from '@prisma/client'

export interface BuscaOptions {
  page?: number
  limit?: number
  status?: string
  dataInicio?: string
  dataFim?: string
  projetoIds?: string[] // access-control scope for non-admins
}

export class BuscaService {
  async buscarProjetos(query: string, opts: BuscaOptions = {}) {
    const { page = 1, limit = 10, status, dataInicio, dataFim, projetoIds } = opts
    const offset = (page - 1) * limit

    const conditions: Prisma.Sql[] = [
      Prisma.sql`to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, '')) @@ plainto_tsquery('portuguese', ${query})`,
    ]

    if (status) conditions.push(Prisma.sql`status = ${status}`)
    if (projetoIds?.length) conditions.push(Prisma.sql`id = ANY(${projetoIds}::text[])`)
    if (dataInicio) conditions.push(Prisma.sql`"criadoEm" >= ${new Date(dataInicio)}::timestamp`)
    if (dataFim) conditions.push(Prisma.sql`"criadoEm" <= ${new Date(dataFim)}::timestamp`)

    const where = Prisma.join(conditions, ' AND ')

    const [items, countResult] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, nome, descricao, status, "designerId", "clienteId", "criadoEm",
          ts_rank(
            to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, '')),
            plainto_tsquery('portuguese', ${query})
          ) AS rank
        FROM projetos
        WHERE ${where}
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM projetos WHERE ${where}
      `,
    ])

    return { items, total: Number(countResult[0].count) }
  }

  async buscarArtes(query: string, opts: BuscaOptions = {}) {
    const { page = 1, limit = 10, status, dataInicio, dataFim, projetoIds } = opts
    const offset = (page - 1) * limit

    const conditions: Prisma.Sql[] = [
      Prisma.sql`to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, '')) @@ plainto_tsquery('portuguese', ${query})`,
    ]

    if (status) conditions.push(Prisma.sql`status = ${status}`)
    if (projetoIds?.length) conditions.push(Prisma.sql`"projetoId" = ANY(${projetoIds}::text[])`)
    if (dataInicio) conditions.push(Prisma.sql`"criadoEm" >= ${new Date(dataInicio)}::timestamp`)
    if (dataFim) conditions.push(Prisma.sql`"criadoEm" <= ${new Date(dataFim)}::timestamp`)

    const where = Prisma.join(conditions, ' AND ')

    const [items, countResult] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, nome, descricao, status, tipo, "projetoId", "autorId", "criadoEm",
          ts_rank(
            to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, '')),
            plainto_tsquery('portuguese', ${query})
          ) AS rank
        FROM artes
        WHERE ${where}
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM artes WHERE ${where}
      `,
    ])

    return { items, total: Number(countResult[0].count) }
  }

  async buscarTudo(
    query: string,
    opts: BuscaOptions & { tipo?: 'projeto' | 'arte' } = {},
  ) {
    const { tipo, ...rest } = opts

    if (tipo === 'projeto') {
      const { items, total } = await this.buscarProjetos(query, rest)
      return { projetos: items, artes: [], total }
    }

    if (tipo === 'arte') {
      const { items, total } = await this.buscarArtes(query, rest)
      return { projetos: [], artes: items, total }
    }

    const [projResult, arteResult] = await Promise.all([
      this.buscarProjetos(query, rest),
      this.buscarArtes(query, rest),
    ])

    return {
      projetos: projResult.items,
      artes: arteResult.items,
      total: projResult.total + arteResult.total,
    }
  }
}

export const buscaService = new BuscaService()
