import prisma from '../database/client.js'
import { formatCurrency, formatDateShort } from '../utils/formatters.js'
import { estadosNaoTerminais, DISPUTA_TRANSITIONS } from '../utils/stateMachine.js'

/**
 * O dinheiro da plataforma, visto por quem responde por ele.
 *
 * O VIU retém uma taxa de cada fatura — 5% a 10%, conforme o plano do designer
 * — e essa é a receita do produto. Ela é calculada em `faturaService`, gravada
 * em `Fatura.taxaPlataforma`, e **nada no sistema a somava**: o
 * `adminResumoService` acompanha funil, fila de saques e usuários novos, e de
 * dinheiro não fala. Não havia como responder "quanto o VIU faturou no mês
 * passado" sem abrir o banco.
 *
 * As linhas saem dos documentos de origem, e não do ledger. O ledger é a visão
 * do designer (crédito quando entra, débito quando saca) e sua `referencia` é
 * uma string — `"fatura:<id>"` —, então a quebra entre valor, taxa e líquido
 * não está lá. Quem audita precisa exatamente dessa quebra.
 */

/** Disputa ainda de pé segura dinheiro — os mesmos estados do saqueService. */
const DISPUTA_BLOQUEANTE = estadosNaoTerminais(DISPUTA_TRANSITIONS)

export type Periodo = { inicio: Date; fim: Date }

/**
 * Entrada é fatura paga: a data que vale é a do pagamento, não a da emissão.
 *
 * Uma fatura emitida em setembro e paga em outubro é receita de outubro — e
 * usar `criadoEm` jogaria o número para o mês errado, que é o tipo de erro que
 * só aparece quando alguém confere contra o extrato bancário.
 */
function ondePagaNoPeriodo({ inicio, fim }: Periodo) {
  return { status: 'PAGA', dataPagamento: { gte: inicio, lte: fim } }
}

export class AdminFinanceiroService {
  async resumo(periodo: Periodo) {
    const [faturas, estornadas, saquesPagos, saquesAPagar, retido] = await Promise.all([
      prisma.fatura.aggregate({
        _sum: { valor: true, taxaPlataforma: true, valorLiquidoDesigner: true },
        _count: { _all: true },
        where: ondePagaNoPeriodo(periodo),
      }),
      prisma.fatura.aggregate({
        _sum: { valor: true },
        _count: { _all: true },
        where: { status: 'ESTORNADA', atualizadoEm: { gte: periodo.inicio, lte: periodo.fim } },
      }),
      prisma.saque.aggregate({
        _sum: { valor: true },
        _count: { _all: true },
        where: { status: 'CONCLUIDO', atualizadoEm: { gte: periodo.inicio, lte: periodo.fim } },
      }),
      /*
       * A pagar não é filtrado por período de propósito: é uma dívida que
       * existe HOJE, não um fato do mês. Recortá-la por data esconderia um
       * saque pedido em agosto e ainda não pago.
       */
      prisma.saque.aggregate({
        _sum: { valor: true },
        _count: { _all: true },
        where: { status: { in: ['SOLICITADO', 'PROCESSANDO'] } },
      }),
      prisma.disputa.aggregate({
        _sum: { saldoBloqueado: true },
        _count: { _all: true },
        where: { status: { in: DISPUTA_BLOQUEANTE } },
      }),
    ])

    const volume = faturas._sum.valor ?? 0
    const receita = faturas._sum.taxaPlataforma ?? 0
    const repassado = faturas._sum.valorLiquidoDesigner ?? 0

    const linha = (valor: number, quantidade: number) => ({
      valor,
      valorFormatado: formatCurrency(valor),
      quantidade,
    })

    return {
      periodo: { inicio: periodo.inicio, fim: periodo.fim },
      /** A receita do VIU: a soma das taxas retidas das faturas pagas. */
      receita: linha(receita, faturas._count._all),
      /** Tudo o que passou pela plataforma, incluindo o que é do designer. */
      volume: linha(volume, faturas._count._all),
      repassado: linha(repassado, faturas._count._all),
      estornado: linha(estornadas._sum.valor ?? 0, estornadas._count._all),
      saquesPagos: linha(saquesPagos._sum.valor ?? 0, saquesPagos._count._all),
      /** Dívida de hoje, sem recorte de período. */
      aPagar: linha(saquesAPagar._sum.valor ?? 0, saquesAPagar._count._all),
      /** Dinheiro de designer parado por disputa em aberto. */
      retidoEmDisputa: linha(retido._sum.saldoBloqueado ?? 0, retido._count._all),
      /*
       * A emissão de nota ainda não existe (ver NFSE_POC.md). O campo aparece
       * declarado e nulo em vez de ausente: some da tela seria esconder uma
       * pendência que é justamente do interesse de quem audita.
       */
      notasFiscais: null as null,
    }
  }

  /**
   * Cada movimento de dinheiro do período, dos documentos de origem.
   *
   * Entradas são faturas pagas, com a quebra entre o que o cliente pagou, o
   * que o VIU reteve e o que o designer recebeu. Saídas são saques concluídos.
   * As duas coisas numa lista só, na ordem em que aconteceram.
   */
  async movimentos(periodo: Periodo) {
    const [faturas, saques] = await Promise.all([
      prisma.fatura.findMany({
        where: ondePagaNoPeriodo(periodo),
        select: {
          id: true,
          valor: true,
          taxaPlataforma: true,
          valorLiquidoDesigner: true,
          dataPagamento: true,
          projeto: { select: { id: true, nome: true } },
          cliente: { select: { id: true, nome: true } },
          designer: { select: { id: true, nome: true } },
        },
        orderBy: { dataPagamento: 'desc' },
      }),
      prisma.saque.findMany({
        where: { status: 'CONCLUIDO', atualizadoEm: { gte: periodo.inicio, lte: periodo.fim } },
        select: {
          id: true,
          valor: true,
          atualizadoEm: true,
          designer: { select: { id: true, nome: true } },
          chavePix: { select: { tipo: true, chave: true } },
        },
        orderBy: { atualizadoEm: 'desc' },
      }),
    ])

    const entradas = faturas.map((f) => ({
      id: f.id,
      tipo: 'ENTRADA' as const,
      data: f.dataPagamento!,
      dataFormatada: formatDateShort(f.dataPagamento!),
      descricao: `Fatura paga — ${f.projeto?.nome ?? 'projeto removido'}`,
      contraparte: f.cliente?.nome ?? '—',
      designer: f.designer?.nome ?? '—',
      valor: f.valor,
      valorFormatado: formatCurrency(f.valor),
      /** A quebra é o que distingue auditoria de extrato. */
      taxaPlataforma: f.taxaPlataforma,
      taxaPlataformaFormatada: formatCurrency(f.taxaPlataforma),
      valorLiquidoDesigner: f.valorLiquidoDesigner,
      valorLiquidoDesignerFormatado: formatCurrency(f.valorLiquidoDesigner),
      referencia: `fatura:${f.id}`,
      projetoId: f.projeto?.id ?? null,
      /** Reservado: a emissão ainda não existe. */
      notaFiscal: null as null,
    }))

    const saidas = saques.map((s) => ({
      id: s.id,
      tipo: 'SAIDA' as const,
      data: s.atualizadoEm,
      dataFormatada: formatDateShort(s.atualizadoEm),
      descricao: `Saque pago — PIX ${s.chavePix?.tipo ?? '—'}`,
      contraparte: s.designer?.nome ?? '—',
      designer: s.designer?.nome ?? '—',
      valor: s.valor,
      valorFormatado: formatCurrency(s.valor),
      // Saque não tem quebra: o valor inteiro sai para o designer.
      taxaPlataforma: 0,
      taxaPlataformaFormatada: formatCurrency(0),
      valorLiquidoDesigner: s.valor,
      valorLiquidoDesignerFormatado: formatCurrency(s.valor),
      referencia: `saque:${s.id}`,
      projetoId: null,
      notaFiscal: null as null,
    }))

    return [...entradas, ...saidas].sort((a, b) => b.data.getTime() - a.data.getTime())
  }
}

const _svc = new AdminFinanceiroService()
export const resumoFinanceiro = (...a: Parameters<AdminFinanceiroService['resumo']>) => _svc.resumo(...a)
export const movimentosFinanceiros = (...a: Parameters<AdminFinanceiroService['movimentos']>) =>
  _svc.movimentos(...a)
