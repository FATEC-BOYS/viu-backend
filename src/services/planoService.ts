import prisma from '../database/client.js'
import { formatCurrency } from '../utils/formatters.js'

export class PlanoService {
  async listPlanos(tipo?: string) {
    const planos = await prisma.plano.findMany({
      where: { ativo: true, ...(tipo && { tipo }) },
      orderBy: [{ tipo: 'asc' }, { precoMensal: 'asc' }],
    })
    return planos.map((p) => ({
      ...p,
      precoMensalFormatado: formatCurrency(p.precoMensal),
      precoAnualFormatado: p.precoAnual ? formatCurrency(p.precoAnual) : null,
      taxaPlataformaFormatada: `${(p.taxaPlataforma * 100).toFixed(0)}%`,
    }))
  }

  async getPlanoById(id: string) {
    return prisma.plano.findUnique({ where: { id } })
  }

  async createPlano(data: {
    nome: string
    tipo: string
    precoMensal: number
    precoAnual?: number
    taxaPlataforma?: number
    limitesProjetos?: number
    limitesArtes?: number
    limitesStorageMb?: number
    descricao?: string
  }) {
    return prisma.plano.create({ data })
  }

  async updatePlano(id: string, data: Partial<Parameters<PlanoService['createPlano']>[0]>) {
    const plano = await prisma.plano.findUnique({ where: { id } })
    if (!plano) throw new Error('Plano não encontrado')
    return prisma.plano.update({ where: { id }, data })
  }
}

const planoService = new PlanoService()

export const listPlanos = (tipo?: string) => planoService.listPlanos(tipo)
export const getPlanoById = (id: string) => planoService.getPlanoById(id)
export const createPlano = (data: Parameters<PlanoService['createPlano']>[0]) =>
  planoService.createPlano(data)
export const updatePlano = (id: string, data: Parameters<PlanoService['updatePlano']>[1]) =>
  planoService.updatePlano(id, data)
