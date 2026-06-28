import prisma from '../database/client.js'
import { mpPayment } from './mercadoPagoService.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'

const TAXA_PADRAO = 0.10

export class FaturaService {
  async criarFatura(
    projetoId: string,
    requesterId: string,
    descricao?: string,
    dataVencimento?: string,
  ) {
    const projeto = await prisma.projeto.findUnique({ where: { id: projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')
    if (!projeto.orcamento) throw new Error('Projeto não possui orçamento definido')

    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (projeto.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Apenas o designer do projeto pode criar faturas')
    }

    const faturaExistente = await prisma.fatura.findFirst({
      where: { projetoId, status: { in: ['PENDENTE', 'PAGA'] } },
    })
    if (faturaExistente) throw new Error('Já existe uma fatura ativa para este projeto')

    const assinaturaDesigner = await prisma.assinatura.findFirst({
      where: { usuarioId: projeto.designerId, status: 'ATIVA' },
      include: { plano: true },
    })
    const taxaPercentual = assinaturaDesigner?.plano.taxaPlataforma ?? TAXA_PADRAO
    const taxaValor = Math.round(projeto.orcamento * taxaPercentual)
    const valorLiquido = projeto.orcamento - taxaValor

    return prisma.fatura.create({
      data: {
        projetoId,
        clienteId: projeto.clienteId,
        designerId: projeto.designerId,
        valor: projeto.orcamento,
        taxaPlataforma: taxaValor,
        valorLiquidoDesigner: valorLiquido,
        descricao: descricao ?? `Pagamento do projeto: ${projeto.nome}`,
        ...(dataVencimento ? { dataVencimento: new Date(dataVencimento) } : {}),
      },
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        designer: { select: { id: true, nome: true } },
      },
    })
  }

  async pagarFaturaComPix(faturaId: string, usuarioId: string, cpf: string) {
    const fatura = await prisma.fatura.findUnique({
      where: { id: faturaId },
      include: {
        cliente: { select: { nome: true, email: true } },
        projeto: { select: { nome: true } },
      },
    })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (fatura.clienteId !== usuarioId) throw new Error('Acesso negado')
    if (fatura.status !== 'PENDENTE') throw new Error('Fatura não está pendente')

    const payment = await mpPayment.create({
      body: {
        transaction_amount: fatura.valor / 100,
        description: fatura.descricao ?? `Projeto: ${fatura.projeto.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: fatura.cliente.email,
          first_name: fatura.cliente.nome.split(' ')[0],
          last_name: fatura.cliente.nome.split(' ').slice(1).join(' ') || ' ',
          identification: { type: 'CPF', number: cpf.replace(/\D/g, '') },
        },
        date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      requestOptions: { idempotencyKey: `fatura-${faturaId}` },
    })

    const pagamento = await prisma.pagamento.create({
      data: {
        tipo: 'FATURA',
        status: 'PENDENTE',
        valor: fatura.valor,
        metodoPagamento: 'PIX',
        mpPaymentId: String(payment.id),
        mpStatus: payment.status ?? null,
        mpQrCode: (payment as any).point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        mpQrCodeText: (payment as any).point_of_interaction?.transaction_data?.qr_code ?? null,
        usuarioId,
        faturaId,
      },
    })

    return {
      pagamentoId: pagamento.id,
      qrCode: pagamento.mpQrCode,
      qrCodeText: pagamento.mpQrCodeText,
      expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  async listarFaturas(usuarioId: string, tipo: 'cliente' | 'designer') {
    const where = tipo === 'cliente' ? { clienteId: usuarioId } : { designerId: usuarioId }
    const faturas = await prisma.fatura.findMany({
      where,
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true } },
        designer: { select: { id: true, nome: true } },
        pagamento: { select: { id: true, status: true, metodoPagamento: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })

    return faturas.map((f) => ({
      ...f,
      valorFormatado: formatCurrency(f.valor),
      taxaPlataformaFormatada: formatCurrency(f.taxaPlataforma),
      valorLiquidoDesignerFormatado: formatCurrency(f.valorLiquidoDesigner),
      dataVencimentoFormatada: f.dataVencimento ? formatDate(f.dataVencimento) : null,
      dataPagamentoFormatada: f.dataPagamento ? formatDate(f.dataPagamento) : null,
    }))
  }

  async getFaturaById(id: string) {
    return prisma.fatura.findUnique({
      where: { id },
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        designer: { select: { id: true, nome: true } },
        pagamento: true,
      },
    })
  }

  async cancelarFatura(id: string, requesterId: string) {
    const fatura = await prisma.fatura.findUnique({ where: { id } })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (fatura.status !== 'PENDENTE') throw new Error('Apenas faturas pendentes podem ser canceladas')

    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (fatura.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Acesso negado')
    }

    return prisma.fatura.update({
      where: { id },
      data: { status: 'CANCELADA' },
    })
  }
}
