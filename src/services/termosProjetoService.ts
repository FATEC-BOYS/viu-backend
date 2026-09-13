import prisma from '../database/client.js'
import type { TermosProjeto } from '@prisma/client'

/**
 * Os termos comerciais do projeto — o que o anexo de revisão renderiza.
 *
 * As cláusulas 3.1 (rodadas), 4.1 (prazo de revisão) e 7.2 (limites da
 * licença) vinham como lacunas num PDF. Lacuna em PDF fica em branco; campo
 * em formulário é preenchido, porque a fatura avisa quando falta. E preenchido
 * como dado, o produto consegue dizer "2 de 3 rodadas usadas" e "exclusividade
 * até 13/03/2027" na tela, em vez de guardar um anexo que ninguém abre.
 */

/** Os campos que precisam estar preenchidos para o anexo fazer sentido. */
export const CAMPOS_OBRIGATORIOS = [
  'rodadasIncluidas',
  'prazoRevisaoDiasUteis',
  'licencaFinalidade',
  'licencaTerritorio',
  'licencaPrazo',
  'exclusividade',
  'arquivosFonte',
] as const

export type CampoTermo = (typeof CAMPOS_OBRIGATORIOS)[number]

/**
 * O que ainda falta combinar.
 *
 * Devolve a lista, não um booleano, porque quem chama quase sempre precisa
 * dizer à pessoa o que falta — um `false` seco obrigaria a tela a recalcular a
 * mesma coisa por conta própria, e duas listas divergem no primeiro campo novo.
 */
export function camposFaltantes(termos: TermosProjeto | null): CampoTermo[] {
  if (!termos) return [...CAMPOS_OBRIGATORIOS]

  const faltam = CAMPOS_OBRIGATORIOS.filter((campo) => termos[campo] === null || termos[campo] === undefined)

  /*
   * Os dois pares condicionais. `licencaPrazo = ATE_DATA` sem a data deixa a
   * cláusula 7.2 dizendo "vale até ___", e exclusividade marcada sem prazo é
   * cessão disfarçada de licença. O zod já recusa gravar assim, mas linha
   * antiga ou alteração fora da API podem existir — e aqui o custo de conferir
   * é uma comparação.
   */
  if (termos.licencaPrazo === 'ATE_DATA' && !termos.licencaPrazoAte) faltam.push('licencaPrazo')
  if (termos.exclusividade === true && !termos.exclusividadeAte) faltam.push('exclusividade')

  return faltam
}

/** Açúcar para quem só precisa do sim ou não. Uma fonte, dois formatos. */
export function termosCompletos(termos: TermosProjeto | null): boolean {
  return camposFaltantes(termos).length === 0
}

export interface TermosEntrada {
  rodadasIncluidas?: number | null
  prazoRevisaoDiasUteis?: number | null
  licencaFinalidade?: string | null
  licencaTerritorio?: string | null
  licencaPrazo?: string | null
  licencaPrazoAte?: string | null
  exclusividade?: boolean | null
  arquivosFonte?: string | null
  exclusividadeAte?: string | null
}

export class TermosProjetoService {
  async getTermos(projetoId: string) {
    return prisma.termosProjeto.findUnique({ where: { projetoId } })
  }

  /**
   * Salva os termos, criando a linha na primeira vez.
   *
   * Quem pode mexer é o designer do projeto ou um ADMIN — mesma regra de
   * `criarFatura`, porque é o mesmo tipo de decisão: o que vai ser cobrado e
   * sob quais condições. O cliente lê e aceita; não edita.
   */
  async salvarTermos(projetoId: string, requesterId: string, dados: TermosEntrada) {
    const projeto = await prisma.projeto.findUnique({ where: { id: projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')

    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (projeto.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Apenas o designer do projeto pode definir os termos')
    }

    const valores = {
      ...(dados.rodadasIncluidas !== undefined && { rodadasIncluidas: dados.rodadasIncluidas }),
      ...(dados.prazoRevisaoDiasUteis !== undefined && {
        prazoRevisaoDiasUteis: dados.prazoRevisaoDiasUteis,
      }),
      ...(dados.licencaFinalidade !== undefined && { licencaFinalidade: dados.licencaFinalidade }),
      ...(dados.licencaTerritorio !== undefined && { licencaTerritorio: dados.licencaTerritorio }),
      ...(dados.licencaPrazo !== undefined && { licencaPrazo: dados.licencaPrazo }),
      ...(dados.licencaPrazoAte !== undefined && {
        licencaPrazoAte: dados.licencaPrazoAte ? new Date(dados.licencaPrazoAte) : null,
      }),
      ...(dados.exclusividade !== undefined && { exclusividade: dados.exclusividade }),
      ...(dados.exclusividadeAte !== undefined && {
        exclusividadeAte: dados.exclusividadeAte ? new Date(dados.exclusividadeAte) : null,
      }),
      ...(dados.arquivosFonte !== undefined && { arquivosFonte: dados.arquivosFonte }),
    }

    /*
     * `upsert` aqui é correto, ao contrário do de `registrarAceite`: termos são
     * estado corrente e mudam por natureza. O histórico de um termo não vive
     * nesta linha — vive congelado em `ContratoProjeto`, que é onde ele precisa
     * ser imutável.
     */
    return prisma.termosProjeto.upsert({
      where: { projetoId },
      create: { projetoId, ...valores },
      update: valores,
    })
  }
}

export const termosProjetoService = new TermosProjetoService()
