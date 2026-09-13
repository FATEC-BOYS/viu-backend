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
   * Estorno devolve o dinheiro e derruba a premissa da 7.1. Chega por dois
   * caminhos: a arbitragem decidindo a favor do cliente (`estornoService`) e o
   * webhook do Mercado Pago em `refunded` e `charged_back`. Cair no silêncio de
   * NAO_FATURADO esconderia que o pagamento voltou.
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


/**
 * A licença como ela pode ser mostrada a QUALQUER PESSOA COM O LINK.
 *
 * O selo nasceu certo na intenção — fala da licença, não da dívida — e errado
 * no alcance. No link público ele dizia "Quitado em 13/09/2026", "a licença
 * começa com a quitação da fatura" e, pior, "o pagamento deste projeto foi
 * estornado". Link é encaminhado: para o chefe do cliente, para o aprovador
 * interno, para um fornecedor. Nenhum deles pediu para saber se houve briga de
 * dinheiro entre designer e cliente, e `ESTORNADO` conta exatamente isso.
 *
 * Quem abre o link precisa de uma resposta só: dá para usar esta peça? As duas
 * maneiras de não poder usar — ninguém pagou ainda, o pagamento voltou — são a
 * mesma resposta para ele, e a diferença entre elas é assunto das partes.
 *
 * A redução acontece aqui e não na tela de propósito. Escondendo no componente,
 * a data e o estorno continuariam viajando no JSON da rota pública, onde
 * qualquer um lê — e a próxima tela que consumisse a mesma rota vazaria de
 * novo.
 */
export function licencaPublica(licenca: Licenca): Licenca {
  switch (licenca.estado) {
    // Licenciado é licenciado; QUANDO foi quitado é transação, não licença.
    case 'QUITADO':
      return { estado: 'QUITADO', quitadoEm: null }

    case 'EM_ABERTO':
    case 'ESTORNADO':
      return { estado: 'EM_ABERTO', quitadoEm: null }

    case 'NAO_FATURADO':
    default:
      return { estado: 'NAO_FATURADO', quitadoEm: null }
  }
}
