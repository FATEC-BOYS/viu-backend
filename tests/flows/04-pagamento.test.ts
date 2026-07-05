import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/database/client.js', () => {
  const db: any = {
    sessao: { findFirst: vi.fn() },
    usuario: { findUnique: vi.fn() },
    projeto: { findUnique: vi.fn() },
    fatura: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    pagamento: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    ledgerEntry: { create: vi.fn(), findMany: vi.fn() },
    webhookLog: { create: vi.fn(), update: vi.fn() },
    assinatura: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    notificacao: { create: vi.fn() },
    equipeMembro: { findFirst: vi.fn() },
    saque: { aggregate: vi.fn() },
    $transaction: vi.fn(async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(db)
    ),
  }
  return { default: db }
})

vi.mock('../../src/services/notificacaoService.js', () => ({
  notificacaoService: { dispatch: vi.fn() },
}))

// Mock Mercado Pago — never call real gateway in tests
vi.mock('../../src/services/mercadoPagoService.js', () => ({
  mpPayment: {
    create: vi.fn(),
    get: vi.fn(),
  },
  validateMpWebhookSignature: vi.fn().mockReturnValue(true),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { mpPayment, validateMpWebhookSignature } from '../../src/services/mercadoPagoService.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any
const mockMpPayment = mpPayment as any
const mockValidate = validateMpWebhookSignature as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { id: 'csession000000001' }
const PROJETO_ID = 'cprojeto000000001'
const FATURA_ID = 'cfatura00000000001'
const PAGAMENTO_ID = 'cpagamento000001'
const MP_PAYMENT_ID = '12345678'

const PROJETO = {
  id: PROJETO_ID,
  nome: 'Projeto Teste',
  orcamento: 100000, // R$ 1000,00 em centavos
  designerId: DESIGNER.id,
  clienteId: CLIENTE.id,
  status: 'EM_ANDAMENTO',
}

const FATURA_PENDENTE = {
  id: FATURA_ID,
  projetoId: PROJETO_ID,
  clienteId: CLIENTE.id,
  designerId: DESIGNER.id,
  valor: 100000,
  taxaPlataforma: 10000,
  valorLiquidoDesigner: 90000,
  status: 'PENDENTE',
  descricao: 'Pagamento do projeto: Projeto Teste',
  dataVencimento: null,
  dataPagamento: null,
  pagamento: null, // no existing payment
  cliente: { nome: 'Test Cliente', email: 'cliente@test.com' },
  projeto: { nome: 'Projeto Teste' },
}

const QR_CODE = 'base64-qr-code-data'
const QR_CODE_TEXT = '00020126580014br.gov.bcb.pix...'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /projetos/:id/fatura — criar fatura', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    db.sessao.findFirst.mockResolvedValue(SESSION)
    db.equipeMembro.findFirst.mockResolvedValue(null)
  })

  it('designer cria fatura para projeto com orçamento → 201', async () => {
    db.projeto.findUnique.mockResolvedValue(PROJETO)
    db.assinatura.findFirst.mockResolvedValue(null) // taxa padrão 10%
    db.fatura.findUnique.mockResolvedValue(null) // no existing fatura
    db.fatura.findMany.mockResolvedValue([]) // no existing active fatura
    db.usuario.findUnique.mockResolvedValue({ id: DESIGNER.id, tipo: 'DESIGNER' })
    db.fatura.create.mockResolvedValue({
      ...FATURA_PENDENTE,
      projeto: { id: PROJETO_ID, nome: PROJETO.nome },
      cliente: { id: CLIENTE.id, nome: CLIENTE.nome, email: CLIENTE.email },
      designer: { id: DESIGNER.id, nome: DESIGNER.nome },
    })

    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'POST',
      url: `/projetos/${PROJETO_ID}/fatura`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: {},
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.valor).toBe(PROJETO.orcamento)
    expect(db.fatura.create).toHaveBeenCalledOnce()
  })
})

describe('POST /faturas/:id/pagar/pix — gerar PIX', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    db.sessao.findFirst.mockResolvedValue(SESSION)
    db.fatura.findUnique.mockResolvedValue(FATURA_PENDENTE)
    mockMpPayment.create.mockResolvedValue({
      id: MP_PAYMENT_ID,
      status: 'pending',
      point_of_interaction: {
        transaction_data: {
          qr_code_base64: QR_CODE,
          qr_code: QR_CODE_TEXT,
        },
      },
    })
    db.pagamento.create.mockResolvedValue({
      id: PAGAMENTO_ID,
      mpPaymentId: MP_PAYMENT_ID,
      mpQrCode: QR_CODE,
      mpQrCodeText: QR_CODE_TEXT,
      status: 'PENDENTE',
    })
  })

  it('gera QR code PIX para fatura pendente → 201', async () => {
    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'POST',
      url: `/faturas/${FATURA_ID}/pagar/pix`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { cpf: '123.456.789-09' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.qrCode).toBe(QR_CODE)
    expect(body.data.qrCodeText).toBe(QR_CODE_TEXT)
    expect(mockMpPayment.create).toHaveBeenCalledOnce()
  })

  it('segunda chamada reutiliza pagamento existente sem chamar o MP novamente → 201', async () => {
    // Fatura com pagamento PENDENTE já existente
    db.fatura.findUnique.mockResolvedValue({
      ...FATURA_PENDENTE,
      pagamento: {
        id: PAGAMENTO_ID,
        status: 'PENDENTE',
        mpQrCode: QR_CODE,
        mpQrCodeText: QR_CODE_TEXT,
      },
    })

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'POST',
      url: `/faturas/${FATURA_ID}/pagar/pix`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { cpf: '123.456.789-09' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.data.qrCode).toBe(QR_CODE)
    // MP was NOT called — existing QR code was returned
    expect(mockMpPayment.create).not.toHaveBeenCalled()
    expect(db.pagamento.create).not.toHaveBeenCalled()
  })
})

describe('POST /pagamentos/webhook — processar pagamento', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockValidate.mockReturnValue(true)
    // WebhookLog: first create succeeds (not a duplicate)
    db.webhookLog.create.mockResolvedValue({ id: 'cwebhooklog00001' })
    db.webhookLog.update.mockResolvedValue({})
  })

  it('webhook de pagamento aprovado atualiza fatura para PAGA e cria entrada no ledger → 200', async () => {
    const PAGAMENTO_DB = {
      id: PAGAMENTO_ID,
      mpPaymentId: MP_PAYMENT_ID,
      status: 'PENDENTE',
      faturaId: FATURA_ID,
      valor: 100000,
    }
    const FATURA_DB = {
      id: FATURA_ID,
      status: 'PENDENTE',
      valorLiquidoDesigner: 90000,
      designerId: DESIGNER.id,
    }

    mockMpPayment.get.mockResolvedValue({
      id: Number(MP_PAYMENT_ID),
      status: 'approved',
      payment_method_id: 'pix',
    })

    db.pagamento.findUnique.mockResolvedValue(PAGAMENTO_DB)
    db.pagamento.update.mockResolvedValue({ ...PAGAMENTO_DB, status: 'APROVADO' })
    db.fatura.findUnique.mockResolvedValue(FATURA_DB)
    db.fatura.update.mockResolvedValue({ ...FATURA_DB, status: 'PAGA', dataPagamento: new Date() })
    db.ledgerEntry.create.mockResolvedValue({ id: 'cledger000000001' })

    const res = await app.inject({
      method: 'POST',
      url: '/pagamentos/webhook',
      headers: {
        'x-signature': 'ts=1234,v1=abc',
        'x-request-id': 'webhook-req-001',
        ...ORIGIN,
      },
      payload: {
        type: 'payment',
        data: { id: MP_PAYMENT_ID },
      },
    })

    // Webhook always responds 200 immediately (async processing)
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)

    // Allow setImmediate to run the async processing
    await new Promise(resolve => setImmediate(resolve))

    expect(db.pagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APROVADO' }) })
    )
    expect(db.fatura.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAGA' }) })
    )
    expect(db.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'CREDITO',
          valor: 90000,
          designerId: DESIGNER.id,
          referencia: `fatura:${FATURA_ID}`,
        }),
      })
    )
  })

  it('webhook duplicado (mesmo x-request-id) é ignorado → 200 sem reprocessar', async () => {
    // P2002: unique constraint violation on externalId → already processed
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    db.webhookLog.create.mockRejectedValue(p2002)

    const res = await app.inject({
      method: 'POST',
      url: '/pagamentos/webhook',
      headers: {
        'x-signature': 'ts=1234,v1=abc',
        'x-request-id': 'webhook-req-001',
        ...ORIGIN,
      },
      payload: { type: 'payment', data: { id: MP_PAYMENT_ID } },
    })

    expect(res.statusCode).toBe(200)
    await new Promise(resolve => setImmediate(resolve))
    expect(db.pagamento.update).not.toHaveBeenCalled()
    expect(db.ledgerEntry.create).not.toHaveBeenCalled()
  })
})
