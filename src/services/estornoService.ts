import prisma from '../database/client.js'
import { mpRefund } from './mercadoPagoService.js'
import { formatCurrency } from '../utils/formatters.js'
import { estadosQueLevamA, FATURA_TRANSITIONS, PAGAMENTO_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'

/**
 * Devolver dinheiro ao cliente.
 *
 * Até aqui o VIU só sabia receber. O estorno existia de fora para dentro:
 * alguém abria o painel do Mercado Pago, estornava à mão, e o webhook
 * `refunded` chegava depois e acertava os livros. Nada dentro do produto
 * iniciava a devolução — e a arbitragem, que é exatamente onde se decide
 * devolver, mudava só o status da disputa.
 *
 * O efeito disso era o contrário do que a tela dizia. O saldo do designer é
 * `Σ fatura.valorLiquidoDesigner (PAGA) − saques − Σ disputa.saldoBloqueado`.
 * "Decidir pelo cliente" zerava o bloqueio e deixava a fatura PAGA: a parcela
 * voltava para a soma. Julgar a favor do cliente **pagava o designer**.
 */

/**
 * De onde dá para estornar. Sai da máquina de estados em vez de ser `['PAGA']`
 * escrito à mão — um estado novo que ninguém lembrasse de incluir aqui seria
 * uma fatura estornável duas vezes, ou nenhuma.
 */
const ORIGENS_DE_ESTORNO = estadosQueLevamA(FATURA_TRANSITIONS, 'ESTORNADA')
const ORIGENS_DE_ESTORNO_PAGAMENTO = estadosQueLevamA(PAGAMENTO_TRANSITIONS, 'ESTORNADO')

export interface ResultadoEstorno {
  /** Falso quando a fatura já estava estornada — repetir não é erro. */
  aplicado: boolean
  /**
   * Se o dinheiro saiu pelo gateway. Falso quando a fatura foi marcada paga
   * sem passar pelo Mercado Pago: aí os livros acertam, mas alguém precisa
   * mover o dinheiro à mão. Quem chama precisa poder dizer isso na tela.
   */
  viaGateway: boolean
  valorDevolvido: number
}

/**
 * Escreve o estorno nos livros. **O único lugar que escreve `ESTORNADA`** — o
 * webhook do Mercado Pago e a arbitragem passam os dois por aqui.
 *
 * O `updateMany` com o status no `where` é um compare-and-set: quem perde a
 * corrida recebe `count: 0` e não cria lançamento nenhum. Sem isso, o webhook
 * chegando junto com a decisão da arbitragem debitaria o designer duas vezes
 * pelo mesmo estorno.
 */
export async function aplicarEstornoNosLivros(
  faturaId: string,
  descricao: string,
): Promise<boolean> {
  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    select: { valorLiquidoDesigner: true, designerId: true },
  })
  if (!fatura) return false

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.fatura.updateMany({
      where: { id: faturaId, status: { in: ORIGENS_DE_ESTORNO } },
      data: { status: 'ESTORNADA' },
    })
    if (count === 0) return false

    await tx.pagamento.updateMany({
      where: { faturaId, status: { in: ORIGENS_DE_ESTORNO_PAGAMENTO } },
      data: { status: 'ESTORNADO' },
    })

    await tx.ledgerEntry.create({
      data: {
        tipo: 'DEBITO',
        valor: fatura.valorLiquidoDesigner,
        descricao,
        // Prefixo distinto do crédito: `fatura:<id>` é o recebimento,
        // `estorno-fatura:<id>` é a devolução. Mesma referência nos dois
        // tornaria o extrato ilegível justamente na linha que explica por que
        // o saldo caiu.
        referencia: `estorno-fatura:${faturaId}`,
        designerId: fatura.designerId,
      },
    })
    return true
  })
}

/**
 * Estorna de verdade: primeiro no Mercado Pago, depois nos livros.
 *
 * Nessa ordem porque o gateway é quem move o dinheiro. Se ele recusar, o erro
 * sobe e nada é escrito — uma fatura marcada `ESTORNADA` sem devolução é pior
 * do que uma disputa em aberto, porque some do saldo do designer e não aparece
 * no extrato do cliente.
 */
export async function estornarFatura(faturaId: string, motivo: string): Promise<ResultadoEstorno> {
  const fatura = await prisma.fatura.findUnique({
    where: { id: faturaId },
    select: {
      id: true,
      status: true,
      valor: true,
      valorLiquidoDesigner: true,
      designerId: true,
      clienteId: true,
      pagamento: { select: { mpPaymentId: true } },
      projeto: { select: { nome: true } },
    },
  })
  if (!fatura) throw new Error('Fatura não encontrada')

  if (fatura.status === 'ESTORNADA') {
    return { aplicado: false, viaGateway: false, valorDevolvido: fatura.valor }
  }
  if (!ORIGENS_DE_ESTORNO.includes(fatura.status)) {
    throw new Error(`Não há o que estornar: a fatura está ${fatura.status}`)
  }

  /*
   * `total()` e não um estorno parcial do líquido: devolver só a parte do
   * designer deixaria a taxa da plataforma com o VIU numa transação desfeita —
   * lucro sobre um trabalho que a arbitragem julgou não entregue. O cliente
   * recebe de volta o que pagou.
   */
  const mpPaymentId = fatura.pagamento?.mpPaymentId ?? null
  if (mpPaymentId) {
    try {
      await mpRefund.total({ payment_id: mpPaymentId })
    } catch (erro: any) {
      /*
       * A causa vai na mensagem em vez de virar um 500 genérico: "saldo
       * insuficiente na conta do vendedor" e "pagamento antigo demais para
       * estornar" pedem ações diferentes de quem arbitrou, e um "erro interno"
       * não deixa escolher nenhuma das duas.
       */
      throw new Error(
        `O Mercado Pago recusou o estorno: ${erro?.message ?? 'motivo não informado'}`,
      )
    }
  }

  const aplicado = await aplicarEstornoNosLivros(fatura.id, motivo)

  if (aplicado) {
    notificacaoService.dispatch(
      fatura.clienteId,
      'SISTEMA',
      'Estorno emitido',
      `O pagamento de ${formatCurrency(fatura.valor)} do projeto "${fatura.projeto.nome}" foi devolvido. ${motivo}`,
    )
    notificacaoService.dispatch(
      fatura.designerId,
      'SISTEMA',
      'Fatura estornada',
      `A fatura do projeto "${fatura.projeto.nome}" foi estornada e ${formatCurrency(fatura.valorLiquidoDesigner)} saíram do seu saldo. ${motivo}`,
    )
  }

  return { aplicado, viaGateway: mpPaymentId !== null, valorDevolvido: fatura.valor }
}
