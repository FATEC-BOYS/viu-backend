import prisma from '../database/client.js'

/**
 * O estado da licença de uso de um projeto — a cláusula 7.1 do anexo virando
 * comportamento.
 *
 * "Os direitos autorais patrimoniais permanecem do Designer até a quitação
 * integral" é a única cláusula do anexo que o VIU consegue fazer valer sozinho,
 * porque o VIU é a única parte que sabe se a fatura foi paga. Todo o resto —
 * escopo, rodadas, território — depende de alguém interpretar; isto é um
 * `status` no banco.
 *
 * O que se faz com isso é mostrar na própria peça se o uso está licenciado. Não
 * como cobrança: a frase fala da licença, não da dívida. "Uso ainda não
 * licenciado" é fato sobre a arte e serve a quem for usá-la; "você não pagou" é
 * acusação a uma pessoa, e o link é aberto por quem o designer quiser.
 */

export type EstadoLicenca = 'QUITADO' | 'EM_ABERTO' | 'ESTORNADO' | 'NAO_FATURADO'

export interface Licenca {
  estado: EstadoLicenca
  /** Quando a licença passou a valer. Só existe em `QUITADO`. */
  quitadoEm: string | null
}

type FaturaParaLicenca = { status: string; dataPagamento: Date | string | null }

/**
 * Deriva o estado a partir das faturas do projeto.
 *
 * Função pura e separada da consulta de propósito: é a regra que decide se uma
 * peça pode ser usada, e regra que decide licença merece teste sem banco no
 * caminho.
 *
 * A precedência importa. O índice parcial `faturas_uma_ativa_por_projeto`
 * garante no máximo uma PENDENTE ou PAGA por projeto, mas CANCELADA e
 * ESTORNADA se acumulam — então um projeto pode ter uma estornada antiga e uma
 * pendente nova ao mesmo tempo, e aí o que vale é a viva.
 */
export function estadoDaLicenca(faturas: FaturaParaLicenca[]): Licenca {
  const paga = faturas.find((f) => f.status === 'PAGA')
  if (paga) {
    const quitadoEm = paga.dataPagamento
    return {
      estado: 'QUITADO',
      quitadoEm: quitadoEm ? new Date(quitadoEm).toISOString() : null,
    }
  }

  if (faturas.some((f) => f.status === 'PENDENTE')) {
    return { estado: 'EM_ABERTO', quitadoEm: null }
  }

  /*
   * Estorno devolve o dinheiro e derruba a premissa da 7.1. Não existe rota de
   * estorno no produto, mas o webhook do Mercado Pago marca ESTORNADA em
   * `refunded` e `charged_back` — então este caso chega sozinho, e cair no
   * silêncio de NAO_FATURADO esconderia que o pagamento voltou.
   */
  if (faturas.some((f) => f.status === 'ESTORNADA')) {
    return { estado: 'ESTORNADO', quitadoEm: null }
  }

  /*
   * Sem fatura viva — nunca faturado, ou só canceladas. O selo não aparece.
   * Rotular toda peça sem cobrança como "não licenciada" seria o VIU editorializando
   * onde não há fato: trabalho ainda não faturado, cortesia e projeto interno
   * cairiam todos no mesmo aviso.
   */
  return { estado: 'NAO_FATURADO', quitadoEm: null }
}

/** O estado da licença de um projeto, lendo as faturas dele. */
export async function licencaDoProjeto(projetoId: string): Promise<Licenca> {
  const faturas = await prisma.fatura.findMany({
    where: { projetoId },
    select: { status: true, dataPagamento: true },
  })
  return estadoDaLicenca(faturas)
}
