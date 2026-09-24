import { FastifyRequest, FastifyReply } from 'fastify'
import { resumoFinanceiro, movimentosFinanceiros } from '../services/adminFinanceiroService.js'
import { erroInterno } from '../utils/erroInterno.js'

/**
 * O período pedido, ou o mês corrente.
 *
 * Datas chegam como dia (`2026-09-01`), e o fim precisa cobrir o dia inteiro —
 * senão uma fatura paga às 14h do último dia fica de fora e o total do mês sai
 * menor do que o extrato bancário, que é o pior jeito de descobrir um bug.
 */
function periodoDaQuery(query: any) {
  const agora = new Date()
  const inicio = query?.inicio
    ? new Date(`${query.inicio}T00:00:00.000`)
    : new Date(agora.getFullYear(), agora.getMonth(), 1)
  const fim = query?.fim
    ? new Date(`${query.fim}T23:59:59.999`)
    : new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw new Error('Período inválido')
  }
  if (inicio > fim) throw new Error('O início do período é depois do fim')
  return { inicio, fim }
}

export async function resumoFinanceiroHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resumo = await resumoFinanceiro(periodoDaQuery(request.query))
    reply.send({ data: resumo, success: true })
  } catch (erro: any) {
    if (erro?.message?.includes('Período') || erro?.message?.includes('período')) {
      reply.status(400).send({ message: erro.message, success: false })
      return
    }
    erroInterno(request, reply, erro, 'Erro ao montar o resumo financeiro')
  }
}

export async function movimentosFinanceirosHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const periodo = periodoDaQuery(request.query)
    const movimentos = await movimentosFinanceiros(periodo)

    /*
     * CSV é o que torna uma tela auditável de verdade — mais do que fonte
     * monoespaçada. Sai do servidor, e não do que está na tela, para que o
     * arquivo cubra o período inteiro e não a página que estava à vista.
     */
    if ((request.query as any)?.formato === 'csv') {
      const cabecalho = [
        'data', 'tipo', 'descricao', 'contraparte', 'designer',
        'valor_centavos', 'taxa_plataforma_centavos', 'liquido_designer_centavos',
        'referencia', 'nota_fiscal',
      ]
      const escapar = (v: unknown) => {
        const t = String(v ?? '')
        // Aspas e ponto-e-vírgula dentro do campo quebrariam a coluna.
        return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
      }
      const linhas = movimentos.map((m) =>
        [
          m.data.toISOString(), m.tipo, m.descricao, m.contraparte, m.designer,
          m.valor, m.taxaPlataforma, m.valorLiquidoDesigner,
          m.referencia, m.notaFiscal ?? '',
        ].map(escapar).join(';'),
      )
      const nome = `viu-financeiro-${periodo.inicio.toISOString().slice(0, 10)}_${periodo.fim.toISOString().slice(0, 10)}.csv`
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${nome}"`)
        // BOM: sem ele o Excel em pt-BR abre "São Paulo" como "SÃ£o Paulo".
        .send('﻿' + [cabecalho.join(';'), ...linhas].join('\n'))
      return
    }

    reply.send({ data: movimentos, success: true })
  } catch (erro: any) {
    if (erro?.message?.includes('Período') || erro?.message?.includes('período')) {
      reply.status(400).send({ message: erro.message, success: false })
      return
    }
    erroInterno(request, reply, erro, 'Erro ao listar movimentos financeiros')
  }
}
