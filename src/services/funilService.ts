import prisma from '../database/client.js'

/**
 * O caminho do link, contado.
 *
 * O produto promete encurtar a volta entre "mandei a arte" e "está aprovado".
 * Até aqui ninguém sabia onde essa volta trava: se o link não chega, se chega e
 * não abre, se abre e o cliente não fala, ou se fala e não decide. Cada um
 * desses tem um remédio diferente — e sem o número a conversa vira palpite.
 *
 * A unidade é a ARTE COMPARTILHADA, não o link: reenviar o mesmo trabalho
 * porque o primeiro link expirou não é outra entrega, e contar por link faria
 * a etapa de cima inflar sozinha.
 *
 * Cada etapa é subconjunto da anterior — por isso "abriu" só conta arte que
 * saiu por link, e "decidiu" só conta arte que alguém abriu. Somar estados
 * independentes daria um funil que não afunila.
 */

export type EtapasDoFunil = {
  compartilhadas: number
  abertas: number
  comentadas: number
  decididas: number
  /** Dias entre pedir a decisão e recebê-la. Mediana, não média: com poucos
   *  casos um cliente que sumiu por um mês move a média e não move a verdade. */
  medianaDiasAteDecidir: number | null
}

type ArteDoFunil = {
  clienteId: string
  acessos: number[]
  autoresDeFeedback: string[]
  aprovacoes: { status: string; criadoEm: Date; decididoEm: Date | null }[]
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  const alto = ordenados[meio] as number
  if (ordenados.length % 2 !== 0) return alto
  const baixo = ordenados[meio - 1] as number
  return (baixo + alto) / 2
}

export function contarFunil(artes: ArteDoFunil[]): EtapasDoFunil {
  const compartilhadas = artes.length
  const abertas = artes.filter((a) => a.acessos.some((n) => n > 0))

  // "Comentada" é comentário DO CLIENTE. O designer responder no próprio link
  // não é sinal de que o outro lado se manifestou — e é o outro lado que este
  // funil está medindo.
  const comentadas = abertas.filter((a) => a.autoresDeFeedback.includes(a.clienteId))

  const decididas = abertas.filter((a) =>
    a.aprovacoes.some((ap) => ap.status === 'APROVADO' || ap.status === 'REJEITADO'),
  )

  const dias = artes
    .flatMap((a) => a.aprovacoes)
    .filter((ap) => ap.decididoEm !== null)
    .map((ap) => (ap.decididoEm!.getTime() - ap.criadoEm.getTime()) / 86400000)
    .filter((d) => Number.isFinite(d) && d >= 0)

  return {
    compartilhadas,
    abertas: abertas.length,
    comentadas: comentadas.length,
    decididas: decididas.length,
    medianaDiasAteDecidir: mediana(dias),
  }
}

export class FunilService {
  /** O funil de quem entregou: as artes dos projetos deste designer. */
  async funilDoDesigner(designerId: string): Promise<EtapasDoFunil> {
    const artes = await prisma.arte.findMany({
      where: {
        projeto: { designerId },
        linksCompartilhados: { some: {} },
      },
      select: {
        projeto: { select: { clienteId: true } },
        linksCompartilhados: { select: { acessos: true } },
        feedbacks: { select: { autorId: true } },
        aprovacoes: {
          where: { deletedAt: null },
          select: { status: true, criadoEm: true, decididoEm: true },
        },
      },
    })

    return contarFunil(
      artes.map((a) => ({
        clienteId: a.projeto.clienteId,
        acessos: a.linksCompartilhados.map((l) => l.acessos),
        autoresDeFeedback: a.feedbacks.map((f) => f.autorId),
        aprovacoes: a.aprovacoes.map((ap) => ({
          status: ap.status,
          criadoEm: ap.criadoEm,
          decididoEm: ap.decididoEm,
        })),
      })),
    )
  }
}

export const funilService = new FunilService()
