import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
vi.mock('../../src/services/mercadoPagoService.js', () => ({
  mpPayment: { create: vi.fn(), get: vi.fn() },
  mpPreApproval: {},
  mpRefund: { total: vi.fn() },
  validateMpWebhookSignature: vi.fn().mockReturnValue(true),
}))

import prisma from '../../src/database/client.js'
import { mpPayment } from '../../src/services/mercadoPagoService.js'
import { FaturaService } from '../../src/services/faturaService.js'

const db = prisma as any
const mp = mpPayment as any
const service = new FaturaService()

const CLIENTE = 'ccliente0000000001'
const FATURA = 'cfatura00000000001'

function faturaPendente(pagamentos: any[]) {
  return {
    id: FATURA,
    clienteId: CLIENTE,
    designerId: 'cdesigner000000001',
    valor: 100000,
    status: 'PENDENTE',
    descricao: null,
    pagamentos,
    cliente: { nome: 'João Santos', email: 'joao@empresa.com' },
    projeto: { nome: 'App Mobile' },
  }
}

function tentativa(extra: Record<string, unknown>) {
  return {
    id: 'cpagamento000001',
    status: 'PENDENTE',
    mpQrCode: 'QR',
    mpQrCodeText: '00020126',
    expiraEm: null,
    criadoEm: new Date(),
    ...extra,
  }
}

function respostaDoGateway(extra: Record<string, unknown> = {}) {
  return {
    id: 987654,
    status: 'pending',
    point_of_interaction: {
      transaction_data: { qr_code_base64: 'QRNOVO', qr_code: '00020126NOVO' },
    },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.pagamento.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'cpagamento000002', ...data }),
  )
})

/*
 * O beco sem saída que esta suíte existe para impedir.
 *
 * Quando o QR do PIX expira, o webhook do Mercado Pago marca o pagamento como
 * CANCELADO; quando é recusado, REJEITADO. Os dois são terminais na máquina de
 * estados, mas a FATURA continua PENDENTE — e `pagarFaturaComPix` recusava
 * qualquer tentativa nova com "Esta fatura já possui um pagamento em
 * andamento". Reproduzido no app antes do conserto: os quatro estados não
 * PENDENTE devolviam essa frase, verdadeira em apenas um deles, e o cliente
 * ficava impedido de pagar para sempre.
 */
describe('Nova tentativa de pagamento', () => {
  for (const morto of ['CANCELADO', 'REJEITADO']) {
    it(`deixa tentar de novo depois de ${morto}`, async () => {
      db.fatura.findUnique.mockResolvedValue(faturaPendente([tentativa({ status: morto })]))
      mp.create.mockResolvedValue(respostaDoGateway())

      const r = await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

      expect(mp.create).toHaveBeenCalledOnce()
      expect(r.qrCode).toBe('QRNOVO')
    })
  }

  it('a chave de idempotência é da tentativa, não da fatura', async () => {
    // Era `fatura-<id>`, fixa: mesmo destravando o código, o gateway
    // devolveria o mesmo pagamento morto para sempre.
    db.fatura.findUnique.mockResolvedValue(
      faturaPendente([tentativa({ status: 'CANCELADO' }), tentativa({ status: 'REJEITADO' })]),
    )
    mp.create.mockResolvedValue(respostaDoGateway())

    await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    const { requestOptions } = mp.create.mock.calls[0][0]
    expect(requestOptions.idempotencyKey).toBe(`fatura-${FATURA}-3`)
  })

  it('guarda a tentativa morta — não a sobrescreve', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPendente([tentativa({ status: 'CANCELADO' })]))
    mp.create.mockResolvedValue(respostaDoGateway())

    await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    // Num sistema de dinheiro, apagar tentativa é apagar prova.
    expect(db.pagamento.create).toHaveBeenCalledOnce()
    expect(db.pagamento.update).not.toHaveBeenCalled()
    expect(db.pagamento.delete).not.toHaveBeenCalled()
  })

  it('reexpõe o QR que ainda vale, sem chamar o gateway', async () => {
    const daquiUmaHora = new Date(Date.now() + 60 * 60 * 1000)
    db.fatura.findUnique.mockResolvedValue(
      faturaPendente([tentativa({ status: 'PENDENTE', expiraEm: daquiUmaHora })]),
    )

    const r = await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    expect(mp.create).not.toHaveBeenCalled()
    expect(r.qrCode).toBe('QR')
    // O prazo é o que o QR tem, não um recalculado a partir de agora.
    expect(r.expiraEm).toBe(daquiUmaHora.toISOString())
  })

  it('não reexpõe QR cujo prazo já passou — gera outro', async () => {
    /*
     * O webhook do gateway pode demorar: até ele chegar, um QR vencido
     * continua PENDENTE no banco. Devolvê-lo é entregar ao cliente um código
     * que o banco dele vai recusar.
     */
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000)
    db.fatura.findUnique.mockResolvedValue(
      faturaPendente([tentativa({ status: 'PENDENTE', expiraEm: ontem })]),
    )
    mp.create.mockResolvedValue(respostaDoGateway())

    const r = await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    expect(mp.create).toHaveBeenCalledOnce()
    expect(r.qrCode).toBe('QRNOVO')
  })

  it('recusa quando há uma tentativa realmente em andamento', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPendente([tentativa({ status: 'PROCESSANDO' })]))

    await expect(service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')).rejects.toThrow(
      'pagamento em andamento',
    )
    expect(mp.create).not.toHaveBeenCalled()
  })

  it('não gera outro QR quando já existe pagamento aprovado', async () => {
    // Gerar aqui seria convidar a pagar duas vezes.
    db.fatura.findUnique.mockResolvedValue(faturaPendente([tentativa({ status: 'APROVADO' })]))

    await expect(service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')).rejects.toThrow(
      'já foi paga',
    )
    expect(mp.create).not.toHaveBeenCalled()
  })
})

/*
 * O prazo do QR era `Date.now() + 24h` escrito três vezes e recalculado a cada
 * resposta: quem gerava às 10h e voltava às 23h lia "válido até 23h", treze
 * horas a mais que a verdade.
 */
describe('Prazo do QR', () => {
  it('guarda o prazo que o gateway confirmou', async () => {
    const doGateway = '2026-09-21T10:00:00.000Z'
    db.fatura.findUnique.mockResolvedValue(faturaPendente([]))
    mp.create.mockResolvedValue(respostaDoGateway({ date_of_expiration: doGateway }))

    const r = await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    const { data } = db.pagamento.create.mock.calls[0][0]
    expect(data.expiraEm.toISOString()).toBe(doGateway)
    expect(r.expiraEm).toBe(doGateway)
  })

  it('cai no prazo que pedimos quando o gateway não informa', async () => {
    db.fatura.findUnique.mockResolvedValue(faturaPendente([]))
    mp.create.mockResolvedValue(respostaDoGateway())

    await service.pagarFaturaComPix(FATURA, CLIENTE, '12345678909')

    // O mesmo instante que foi ao gateway — não um recalculado depois.
    const enviado = mp.create.mock.calls[0][0].body.date_of_expiration
    const { data } = db.pagamento.create.mock.calls[0][0]
    expect(data.expiraEm.toISOString()).toBe(enviado)
  })
})
