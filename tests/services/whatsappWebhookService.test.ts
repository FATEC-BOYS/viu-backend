import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', () => ({
  default: {
    webhookLog: { create: vi.fn(), update: vi.fn() },
    whatsAppEnvio: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    feedback: { create: vi.fn() },
    aprovacao: { create: vi.fn() },
    arte: { update: vi.fn() },
    notificacao: { create: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../src/services/whatsappService.js', () => ({
  baixarMidia: vi.fn(),
  enviarTexto: vi.fn().mockResolvedValue('wamid.OUT'),
  enviarConfirmacaoAprovacao: vi.fn().mockResolvedValue('wamid.CONF'),
}))

vi.mock('../../src/services/transcricaoService.js', () => ({
  transcreverAudio: vi.fn().mockResolvedValue('tá aprovado, pode postar'),
}))

import prisma from '../../src/database/client.js'
import { enviarConfirmacaoAprovacao, enviarTexto } from '../../src/services/whatsappService.js'
import {
  normalizarMensagem,
  interpretarResposta,
  processarWebhookWhatsAppAsync,
} from '../../src/services/whatsappWebhookService.js'
import { WhatsAppWebhookPayload } from '../../src/types/whatsapp.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockResolvedValue([] as any)
})

const ENVIO = {
  id: 'env123',
  arteId: 'arte1',
  clienteId: 'cli1',
  telefone: '5511999999999',
  status: 'AGUARDANDO_RESPOSTA',
  arte: { id: 'arte1', nome: 'Post', versao: 2, autorId: 'des1' },
}

function payloadCom(message: Record<string, unknown>): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5511888888888', phone_number_id: 'pn1' },
              messages: [message as any],
            },
          },
        ],
      },
    ],
  }
}

// ─── normalizarMensagem ────────────────────────────────────────────────────

describe('normalizarMensagem', () => {
  const base = { id: 'wamid.1', from: '5511999999999', timestamp: '1770000000' }

  it('texto vira TEXTO com conteúdo', () => {
    const m = normalizarMensagem({ ...base, type: 'text', text: { body: 'tá bom' } })
    expect(m).toMatchObject({ tipo: 'TEXTO', conteudo: 'tá bom', telefone: '5511999999999' })
  })

  it('button_reply vira BOTAO com botaoId estruturado', () => {
    const m = normalizarMensagem({
      ...base,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'aprovar:env123', title: '✅ Aprovar' } },
    })
    expect(m).toMatchObject({ tipo: 'BOTAO', botaoId: 'aprovar:env123' })
  })

  it('quick reply de template (type button) também vira BOTAO', () => {
    const m = normalizarMensagem({
      ...base,
      type: 'button',
      button: { payload: 'aprovar:env123', text: 'Aprovar' },
    })
    expect(m).toMatchObject({ tipo: 'BOTAO', botaoId: 'aprovar:env123' })
  })

  it('áudio vira AUDIO com media id, nunca erro', () => {
    const m = normalizarMensagem({ ...base, type: 'audio', audio: { id: 'media1', mime_type: 'audio/ogg' } })
    expect(m).toMatchObject({ tipo: 'AUDIO', audioId: 'media1' })
  })

  it('sticker vira NAO_SUPORTADO (não lança)', () => {
    const m = normalizarMensagem({ ...base, type: 'sticker' })
    expect(m.tipo).toBe('NAO_SUPORTADO')
  })
})

// ─── interpretarResposta ───────────────────────────────────────────────────

describe('interpretarResposta', () => {
  it('detecta aprovação coloquial', () => {
    expect(interpretarResposta('Tá bom!')).toBe('APROVACAO')
    expect(interpretarResposta('ficou ótimo, pode postar')).toBe('APROVACAO')
  })

  it('pedido de mudança prevalece sobre elogio', () => {
    expect(interpretarResposta('gostei, mas muda aquele azul')).toBe('ALTERACAO')
  })

  it('resposta ambígua fica INDEFINIDO — nunca aprova sozinha', () => {
    expect(interpretarResposta('vou ver com a equipe e te falo')).toBe('INDEFINIDO')
  })
})

// ─── Fluxos do webhook ─────────────────────────────────────────────────────

describe('processarWebhookWhatsAppAsync', () => {
  it('botão aprovar registra aprovação em transação e confirma ao cliente', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.whatsAppEnvio.findUnique).mockResolvedValue(ENVIO as any)

    await processarWebhookWhatsAppAsync(
      payloadCom({
        id: 'wamid.1',
        from: '5511999999999',
        timestamp: '1770000000',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'aprovar:env123', title: '✅ Aprovar' } },
      }),
    )

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(enviarTexto).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Aprovação registrada'))
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSADO' }) }),
    )
  })

  it('botão de telefone divergente é ignorado (não registra aprovação)', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.whatsAppEnvio.findUnique).mockResolvedValue(ENVIO as any)

    await processarWebhookWhatsAppAsync(
      payloadCom({
        id: 'wamid.2',
        from: '5511777777777', // não é o telefone do envio
        timestamp: '1770000000',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'aprovar:env123', title: '✅ Aprovar' } },
      }),
    )

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('texto livre com cara de aprovação pede confirmação — NÃO cria Aprovacao (Princípio nº 3)', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.whatsAppEnvio.findFirst).mockResolvedValue(ENVIO as any)
    vi.mocked(prisma.whatsAppEnvio.update).mockResolvedValue({} as any)

    await processarWebhookWhatsAppAsync(
      payloadCom({
        id: 'wamid.3',
        from: '5511999999999',
        timestamp: '1770000000',
        type: 'text',
        text: { body: 'tá bom, gostei' },
      }),
    )

    expect(prisma.$transaction).not.toHaveBeenCalled() // aprovação NÃO registrada
    expect(enviarConfirmacaoAprovacao).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ envioId: 'env123' }))
    expect(prisma.whatsAppEnvio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'AGUARDANDO_CONFIRMACAO' }) }),
    )
  })

  it('mensagem duplicada (P2002) é ignorada sem processar', async () => {
    vi.mocked(prisma.webhookLog.create).mockRejectedValue({ code: 'P2002' })

    await processarWebhookWhatsAppAsync(
      payloadCom({
        id: 'wamid.1',
        from: '5511999999999',
        timestamp: '1770000000',
        type: 'text',
        text: { body: 'tá bom' },
      }),
    )

    expect(prisma.whatsAppEnvio.findFirst).not.toHaveBeenCalled()
    expect(prisma.webhookLog.update).not.toHaveBeenCalled()
  })

  it('texto livre sem envio ativo é apenas logado — não responde (anti-spam)', async () => {
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({} as any)
    vi.mocked(prisma.whatsAppEnvio.findFirst).mockResolvedValue(null)

    await processarWebhookWhatsAppAsync(
      payloadCom({
        id: 'wamid.4',
        from: '5511666666666',
        timestamp: '1770000000',
        type: 'text',
        text: { body: 'oi' },
      }),
    )

    expect(enviarTexto).not.toHaveBeenCalled()
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSADO' }) }),
    )
  })
})
