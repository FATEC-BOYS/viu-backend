import prisma from '../database/client.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import {
  assertValidTransition,
  estadosNaoTerminais,
  DISPUTA_TRANSITIONS,
  SAQUE_TRANSITIONS,
} from '../utils/stateMachine.js'

const VALOR_MINIMO_SAQUE = 500 // R$ 5,00 em centavos

/**
 * Disputa em aberto congela o valor da fatura em `saldoBloqueado`. Enquanto ela
 * não termina, esse dinheiro não é sacável.
 *
 * A lista sai da própria máquina de estados em vez de ser escrita à mão: um
 * estado novo que ninguém lembrasse de incluir aqui viraria dinheiro liberado
 * durante uma disputa em andamento.
 */
const DISPUTA_STATUS_BLOQUEANTES = estadosNaoTerminais(DISPUTA_TRANSITIONS)

/**
 * Disputa não tem designerId — o vínculo é a fatura de onde o valor saiu.
 *
 * Disputa sem faturaId fica com saldoBloqueado 0 e não afeta nada, que é o
 * comportamento atual: disputa sem cobrança associada não trava saldo.
 */
function disputasBloqueantesWhere(designerId: string) {
  return {
    status: { in: DISPUTA_STATUS_BLOQUEANTES },
    fatura: { designerId },
  }
}

export class SaqueService {
  async listarChavesPix(usuarioId: string) {
    return prisma.chavePix.findMany({
      where: { usuarioId, ativa: true },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async cadastrarChavePix(usuarioId: string, data: { tipo: string; chave: string; titular: string }) {
    const tiposValidos = ['CPF', 'EMAIL', 'TELEFONE', 'ALEATORIA']
    if (!tiposValidos.includes(data.tipo)) {
      throw new Error(`Tipo de chave inválido. Use: ${tiposValidos.join(', ')}`)
    }
    return prisma.chavePix.create({ data: { ...data, usuarioId } })
  }

  async removerChavePix(id: string, usuarioId: string) {
    const chave = await prisma.chavePix.findUnique({ where: { id } })
    if (!chave || !chave.ativa) throw new Error('Chave PIX não encontrada')
    if (chave.usuarioId !== usuarioId) throw new Error('Acesso negado')

    await prisma.chavePix.update({ where: { id }, data: { ativa: false } })
  }

  async getSaldoDisponivel(designerId: string) {
    const [faturasPagas, saquesAtivos, disputasAbertas] = await Promise.all([
      prisma.fatura.aggregate({
        _sum: { valorLiquidoDesigner: true },
        where: { designerId, status: 'PAGA' },
      }),
      prisma.saque.aggregate({
        _sum: { valor: true },
        where: { designerId, status: { in: ['SOLICITADO', 'PROCESSANDO', 'CONCLUIDO'] } },
      }),
      prisma.disputa.aggregate({
        _sum: { saldoBloqueado: true },
        where: disputasBloqueantesWhere(designerId),
      }),
    ])

    const totalRecebido = faturasPagas._sum.valorLiquidoDesigner ?? 0
    const totalSacado = saquesAtivos._sum.valor ?? 0
    const saldoBloqueado = disputasAbertas._sum.saldoBloqueado ?? 0

    // Sem clamp em zero: estorno depois de saque concluido deixa saldo
    // negativo, e esconder isso atras de um Math.max transformaria uma divida
    // real em numero bonito. Quem consome precisa enxergar o buraco.
    const saldo = totalRecebido - totalSacado - saldoBloqueado

    return {
      saldo,
      saldoFormatado: formatCurrency(saldo),
      totalRecebido,
      totalRecebidoFormatado: formatCurrency(totalRecebido),
      totalSacado,
      totalSacadoFormatado: formatCurrency(totalSacado),
      // Exposto para a interface poder dizer por que o saldo caiu — numero que
      // encolhe sem explicacao parece dinheiro sumido.
      saldoBloqueado,
      saldoBloqueadoFormatado: formatCurrency(saldoBloqueado),
    }
  }

  async solicitarSaque(designerId: string, chavePixId: string, valor: number) {
    if (valor < VALOR_MINIMO_SAQUE) {
      throw new Error(`Valor mínimo de saque é ${formatCurrency(VALOR_MINIMO_SAQUE)}`)
    }

    // SERIALIZABLE isolation: PostgreSQL serializes concurrent saque requests for the same
    // designer — one will succeed, the other will get a serialization error and be retried.
    // READ COMMITTED alone is insufficient because two concurrent reads see the same balance
    // snapshot before either write commits, allowing both to pass the balance check.
    return prisma.$transaction(
      async (tx) => {
        const chave = await tx.chavePix.findUnique({ where: { id: chavePixId } })
        if (!chave || !chave.ativa) throw new Error('Chave PIX não encontrada ou inativa')
        if (chave.usuarioId !== designerId) throw new Error('Acesso negado')

        // As tres leituras rodam com `tx`, nao com o prisma global: fora da
        // transacao seria TOCTOU — uma disputa aberta entre a leitura e o
        // insert passaria batido e o valor em disputa sairia mesmo assim.
        const [faturasPagas, saquesAtivos, disputasAbertas] = await Promise.all([
          tx.fatura.aggregate({
            _sum: { valorLiquidoDesigner: true },
            where: { designerId, status: 'PAGA' },
          }),
          tx.saque.aggregate({
            _sum: { valor: true },
            where: { designerId, status: { in: ['SOLICITADO', 'PROCESSANDO', 'CONCLUIDO'] } },
          }),
          tx.disputa.aggregate({
            _sum: { saldoBloqueado: true },
            where: disputasBloqueantesWhere(designerId),
          }),
        ])
        const saldo =
          (faturasPagas._sum.valorLiquidoDesigner ?? 0) -
          (saquesAtivos._sum.valor ?? 0) -
          (disputasAbertas._sum.saldoBloqueado ?? 0)
        if (valor > saldo) throw new Error('Saldo insuficiente para o saque solicitado')

        return tx.saque.create({
          data: { designerId, chavePixId, valor, status: 'SOLICITADO' },
          include: { chavePix: true },
        })
      },
      { isolationLevel: 'Serializable' },
    )
  }

  // Admin: avança status do saque através da state machine.
  // Quando → CONCLUIDO, grava LedgerEntry de DEBITO atomicamente.
  async processarSaque(id: string, novoStatus: string) {
    const saque = await prisma.saque.findUnique({ where: { id } })
    if (!saque) throw new Error('Saque não encontrado')
    assertValidTransition('Saque', SAQUE_TRANSITIONS, saque.status, novoStatus)

    if (novoStatus === 'CONCLUIDO') {
      const [saqueAtualizado] = await prisma.$transaction([
        prisma.saque.update({ where: { id }, data: { status: novoStatus } }),
        prisma.ledgerEntry.create({
          data: {
            tipo: 'DEBITO',
            valor: saque.valor,
            descricao: 'Saque concluído',
            referencia: `saque:${id}`,
            designerId: saque.designerId,
          },
        }),
      ])
      return saqueAtualizado
    }

    return prisma.saque.update({ where: { id }, data: { status: novoStatus } })
  }

  async listarSaques(designerId: string) {
    const saques = await prisma.saque.findMany({
      where: { designerId },
      include: { chavePix: true },
      orderBy: { criadoEm: 'desc' },
    })
    return saques.map((s) => ({
      ...s,
      valorFormatado: formatCurrency(s.valor),
      criadoEmFormatado: formatDate(s.criadoEm),
    }))
  }

  async listarSaquesAdmin(filtros: { status?: string; designerId?: string }) {
    const saques = await prisma.saque.findMany({
      where: {
        ...(filtros.status ? { status: filtros.status } : {}),
        ...(filtros.designerId ? { designerId: filtros.designerId } : {}),
      },
      include: {
        chavePix: true,
        designer: { select: { id: true, nome: true, email: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    return saques.map((s) => ({
      ...s,
      valorFormatado: formatCurrency(s.valor),
      criadoEmFormatado: formatDate(s.criadoEm),
    }))
  }

  async listarLedger(designerId: string) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { designerId },
      orderBy: { criadoEm: 'desc' },
    })
    return entries.map((e) => ({
      ...e,
      valorFormatado: formatCurrency(e.valor),
      criadoEmFormatado: formatDate(e.criadoEm),
    }))
  }
}

const _svc = new SaqueService()
export const listarChavesPix = (...args: Parameters<SaqueService['listarChavesPix']>) => _svc.listarChavesPix(...args)
export const cadastrarChavePix = (...args: Parameters<SaqueService['cadastrarChavePix']>) => _svc.cadastrarChavePix(...args)
export const removerChavePix = (...args: Parameters<SaqueService['removerChavePix']>) => _svc.removerChavePix(...args)
export const getSaldoDisponivel = (...args: Parameters<SaqueService['getSaldoDisponivel']>) => _svc.getSaldoDisponivel(...args)
export const solicitarSaque = (...args: Parameters<SaqueService['solicitarSaque']>) => _svc.solicitarSaque(...args)
export const processarSaque = (...args: Parameters<SaqueService['processarSaque']>) => _svc.processarSaque(...args)
export const listarSaques = (...args: Parameters<SaqueService['listarSaques']>) => _svc.listarSaques(...args)
export const listarSaquesAdmin = (...args: Parameters<SaqueService['listarSaquesAdmin']>) => _svc.listarSaquesAdmin(...args)
export const listarLedger = (...args: Parameters<SaqueService['listarLedger']>) => _svc.listarLedger(...args)
