import prisma from '../database/client.js'
import { comPlanoFormatado } from './planoFormatado.js'

/**
 * O plano Gratuito é o piso do produto, e não pode ser removido por edição.
 *
 * Desde que o teto de recursos e a taxa da fatura passaram a sair de
 * `assinaturaVigente`, quem não assina nada É assinante do Gratuito — e
 * `planoGratuitoDoDesigner` exige `tipo: DESIGNER`, `ativo: true` e
 * `precoMensal: 0`. Tirar qualquer um desses três da última linha que os tem
 * derruba o piso de todo designer sem assinatura de uma vez.
 *
 * Conferido no app: com o Gratuito desativado, `/assinaturas/minha` respondeu
 * "plano em vigor: NENHUM" e `POST /projetos` passou com 3 projetos num teto
 * de 3 — o limite simplesmente deixou de existir. Nada na tela avisava; o
 * texto ao lado do botão dizia apenas que o plano "some da tela de Planos".
 *
 * A guarda mora aqui e não na tela porque é regra do dado: qualquer caminho
 * que edite um plano precisa dela.
 */
async function assertPisoPreservado(
  atual: { id: string; tipo: string; ativo: boolean; precoMensal: number },
  mudanca: { tipo?: string; ativo?: boolean; precoMensal?: number },
) {
  const eraPiso = atual.tipo === 'DESIGNER' && atual.ativo && atual.precoMensal === 0
  if (!eraPiso) return

  const continuaPiso =
    (mudanca.tipo ?? atual.tipo) === 'DESIGNER' &&
    (mudanca.ativo ?? atual.ativo) === true &&
    (mudanca.precoMensal ?? atual.precoMensal) === 0
  if (continuaPiso) return

  // Só é problema se esta for a ÚLTIMA: havendo outro gratuito ativo, o piso
  // continua de pé e a edição é legítima.
  const outro = await prisma.plano.findFirst({
    where: { tipo: 'DESIGNER', ativo: true, precoMensal: 0, id: { not: atual.id } },
    select: { id: true },
  })
  if (outro) return

  throw new Error(
    'Este é o único plano gratuito de designer ativo, e ele é o piso de quem não assina nada: ' +
      'desativá-lo ou cobrar por ele deixaria esses designers sem limite e sem taxa definida. ' +
      'Crie outro plano gratuito antes de mudar este.',
  )
}

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
    await assertPisoPreservado(plano, data)
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
