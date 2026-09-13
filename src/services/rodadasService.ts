import prisma from '../database/client.js'

/**
 * Quantas rodadas de revisão já foram usadas numa peça — a cláusula 3.2 do
 * anexo virando número na tela.
 *
 * O contrato já dizia o que conta: "considera-se uma rodada o conjunto de
 * feedbacks do Cliente sobre uma mesma versão de uma entrega, consolidado até
 * a próxima versão enviada pelo Designer". O dado para calcular isso existe
 * desde que `versaoNumero` passou a ser carimbado pelo servidor. Faltava
 * alguém somar — e sem a soma, metade do valor da cláusula ficava num PDF que
 * ninguém abre: as duas partes combinam "3 rodadas" e nenhuma das duas
 * consegue dizer em qual está.
 *
 * POR PEÇA e não por projeto, como manda a 3.1: um projeto com três artes tem
 * o número acordado de rodadas para cada uma, não somado entre elas.
 */

export interface Rodadas {
  /** Versões distintas que receberam comentário do cliente. */
  usadas: number
  /** O que foi combinado. Nulo quando ninguém combinou ainda. */
  incluidas: number | null
  /**
   * Comentários do cliente sem versão registrada — feedback anterior ao
   * carimbo. Ficam FORA da conta e aparecem à parte.
   *
   * Atribuí-los por proximidade de data produziria um palpite indistinguível
   * de um registro, e este número é argumento em disputa. Melhor uma conta
   * que se declara incompleta do que um número redondo que ninguém consegue
   * defender.
   */
  semVersao: number
  /** Quais versões tiveram rodada, em ordem. Deixa a tela detalhar. */
  versoes: number[]
}

type FeedbackDoCliente = { versaoNumero: number | null }

/**
 * A regra, separada da consulta: é ela que vira argumento numa disputa, e
 * regra que decide dinheiro merece teste sem banco no caminho.
 */
export function contarRodadas(
  feedbacksDoCliente: FeedbackDoCliente[],
  incluidas: number | null,
): Rodadas {
  const versoes = [
    ...new Set(
      feedbacksDoCliente
        .map((f) => f.versaoNumero)
        .filter((v): v is number => v !== null),
    ),
  ].sort((a, b) => a - b)

  return {
    usadas: versoes.length,
    incluidas,
    semVersao: feedbacksDoCliente.filter((f) => f.versaoNumero === null).length,
    versoes,
  }
}

/**
 * As rodadas de uma peça, lendo os comentários dela.
 *
 * Só conta o que o CLIENTE escreveu. Comentário do próprio designer, de quem
 * está na equipe dele ou de um admin não é pedido de revisão — é anotação de
 * trabalho, e contá-lo gastaria uma rodada que o cliente não pediu.
 */
export async function rodadasDaArte(arteId: string): Promise<Rodadas | null> {
  const arte = await prisma.arte.findUnique({
    where: { id: arteId },
    select: { projeto: { select: { clienteId: true, termos: { select: { rodadasIncluidas: true } } } } },
  })
  if (!arte) return null

  const feedbacks = await prisma.feedback.findMany({
    where: { arteId, autorId: arte.projeto.clienteId },
    select: { versaoNumero: true },
  })

  return contarRodadas(feedbacks, arte.projeto.termos?.rodadasIncluidas ?? null)
}
