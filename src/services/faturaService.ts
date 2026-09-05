import prisma from '../database/client.js'
import { mpPayment } from './mercadoPagoService.js'
import { formatCurrency, formatDate } from '../utils/formatters.js'
import { assertValidTransition, FATURA_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'

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

    const fatura = await prisma.fatura.create({
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

    // Notify the client that a new invoice is ready
    notificacaoService.dispatch(
      projeto.clienteId,
      'FATURA_GERADA',
      `Fatura gerada — ${projeto.nome}`,
      `Uma fatura de ${formatCurrency(projeto.orcamento)} foi gerada para o projeto "${projeto.nome}". Acesse para realizar o pagamento.`,
    )

    return fatura
  }

  async pagarFaturaComPix(faturaId: string, usuarioId: string, cpf: string) {
    const fatura = await prisma.fatura.findUnique({
      where: { id: faturaId },
      include: {
        cliente: { select: { nome: true, email: true } },
        projeto: { select: { nome: true } },
        pagamento: { select: { id: true, status: true, mpQrCode: true, mpQrCodeText: true } },
      },
    })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (fatura.clienteId !== usuarioId) throw new Error('Acesso negado')
    if (fatura.status !== 'PENDENTE') throw new Error('Fatura não está pendente')

    // Pagamento já existe para esta fatura (idempotência no nível da aplicação)
    if (fatura.pagamento) {
      if (fatura.pagamento.status !== 'PENDENTE') {
        throw new Error('Esta fatura já possui um pagamento em andamento')
      }
      // Reexpõe o QR code existente em vez de criar outro
      return {
        pagamentoId: fatura.pagamento.id,
        qrCode: fatura.pagamento.mpQrCode,
        qrCodeText: fatura.pagamento.mpQrCodeText,
        expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
    }

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

  async getFaturaById(id: string, requesterId: string, isAdmin: boolean) {
    const fatura = await prisma.fatura.findUnique({
      where: { id },
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        designer: { select: { id: true, nome: true } },
        pagamento: true,
      },
    })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (!isAdmin && fatura.clienteId !== requesterId && fatura.designerId !== requesterId) {
      throw new Error('Acesso negado')
    }
    return fatura
  }

  async cancelarFatura(id: string, requesterId: string) {
    const fatura = await prisma.fatura.findUnique({ where: { id } })
    if (!fatura) throw new Error('Fatura não encontrada')

    // Autorização antes da máquina de estados. Na ordem inversa, a mensagem de
    // "transição inválida" respondia sobre o estado de uma fatura de outra
    // pessoa — um oráculo de status para quem só tem o id.
    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (fatura.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Acesso negado')
    }

    assertValidTransition('Fatura', FATURA_TRANSITIONS, fatura.status, 'CANCELADA')

    return prisma.fatura.update({
      where: { id },
      data: { status: 'CANCELADA' },
    })
  }
}

const _svc = new FaturaService()
export const criarFatura = (...args: Parameters<FaturaService['criarFatura']>) => _svc.criarFatura(...args)
export const pagarFaturaComPix = (...args: Parameters<FaturaService['pagarFaturaComPix']>) => _svc.pagarFaturaComPix(...args)
export const listarFaturas = (...args: Parameters<FaturaService['listarFaturas']>) => _svc.listarFaturas(...args)
export const getFaturaById = (...args: Parameters<FaturaService['getFaturaById']>) => _svc.getFaturaById(...args)
export const cancelarFatura = (...args: Parameters<FaturaService['cancelarFatura']>) => _svc.cancelarFatura(...args)
