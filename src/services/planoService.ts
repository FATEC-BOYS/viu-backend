import prisma from '../database/client.js'
import { comPlanoFormatado } from './planoFormatado.js'

export class PlanoService {
  /**
   * `incluirInativos` existe para a tela de administração.
   *
   * A listagem sempre escondeu plano inativo — certo para quem vai assinar,
   * errado para quem administra: desativar um plano o tirava da própria tela
   * que o desativou, e não havia como reativá-lo. Porta de mão única.
   */
  async listPlanos(tipo?: string, incluirInativos = false) {
    const planos = await prisma.plano.findMany({
      where: { ...(incluirInativos ? {} : { ativo: true }), ...(tipo && { tipo }) },
      orderBy: [{ tipo: 'asc' }, { precoMensal: 'asc' }],
    })
    return planos.map(comPlanoFormatado)
  }

  /*
   * Formatado como na listagem. As duas rotas descrevem o mesmo plano, e só
   * uma trazia os campos que a tela lê — o mesmo descasamento que faturas e
   * saques já tiveram.
   */
  async getPlanoById(id: string) {
    const plano = await prisma.plano.findUnique({ where: { id } })
    return plano ? comPlanoFormatado(plano) : null
  }

  async createPlano(data: {
    nome: string
    tipo: string
    precoMensal: number
    precoAnual?: number | null
    taxaPlataforma?: number
    limitesProjetos?: number | null
    limitesArtes?: number | null
    limitesStorageMb?: number | null
    descricao?: string | null
    ativo?: boolean
  }) {
    // A tela de administração insere a linha criada direto na lista; crua,
    // ela apareceria sem preço e sem taxa.
    return comPlanoFormatado(await prisma.plano.create({ data }))
  }

  async updatePlano(id: string, data: Partial<Parameters<PlanoService['createPlano']>[0]>) {
    const plano = await prisma.plano.findUnique({ where: { id } })
    if (!plano) throw new Error('Plano não encontrado')
    return comPlanoFormatado(await prisma.plano.update({ where: { id }, data }))
  }
}

const planoService = new PlanoService()

export const listPlanos = (tipo?: string, incluirInativos?: boolean) =>
  planoService.listPlanos(tipo, incluirInativos)
export const getPlanoById = (id: string) => planoService.getPlanoById(id)
export const createPlano = (data: Parameters<PlanoService['createPlano']>[0]) =>
  planoService.createPlano(data)
export const updatePlano = (id: string, data: Parameters<PlanoService['updatePlano']>[1]) =>
  planoService.updatePlano(id, data)
