import prisma from '../database/client.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'

const VALOR_MINIMO_SAQUE = 500 // R$ 5,00 em centavos

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
    const [faturasPagas, saquesAtivos] = await Promise.all([
      prisma.fatura.aggregate({
        _sum: { valorLiquidoDesigner: true },
        where: { designerId, status: 'PAGA' },
      }),
      prisma.saque.aggregate({
        _sum: { valor: true },
        where: { designerId, status: { in: ['SOLICITADO', 'PROCESSANDO', 'CONCLUIDO'] } },
      }),
    ])

    const totalRecebido = faturasPagas._sum.valorLiquidoDesigner ?? 0
    const totalSacado = saquesAtivos._sum.valor ?? 0
    const saldo = totalRecebido - totalSacado

    return {
      saldo,
      saldoFormatado: formatCurrency(saldo),
      totalRecebido,
      totalRecebidoFormatado: formatCurrency(totalRecebido),
      totalSacado,
      totalSacadoFormatado: formatCurrency(totalSacado),
    }
  }

  async solicitarSaque(designerId: string, chavePixId: string, valor: number) {
    if (valor < VALOR_MINIMO_SAQUE) {
      throw new Error(`Valor mínimo de saque é ${formatCurrency(VALOR_MINIMO_SAQUE)}`)
    }

    const chave = await prisma.chavePix.findUnique({ where: { id: chavePixId } })
    if (!chave || !chave.ativa) throw new Error('Chave PIX não encontrada ou inativa')
    if (chave.usuarioId !== designerId) throw new Error('Acesso negado')

    const { saldo } = await this.getSaldoDisponivel(designerId)
    if (valor > saldo) throw new Error('Saldo insuficiente para o saque solicitado')

    return prisma.saque.create({
      data: { designerId, chavePixId, valor, status: 'SOLICITADO' },
      include: { chavePix: true },
    })
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
}
