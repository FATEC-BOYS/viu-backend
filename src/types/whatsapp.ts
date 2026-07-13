// src/types/whatsapp.ts
/**
 * Tipos do webhook e da API oficial do WhatsApp Business (Meta Cloud API).
 *
 * Cobrem apenas os campos que o VIU consome. O payload real da Meta contém
 * mais campos — os handlers devem tolerar propriedades desconhecidas.
 *
 * Referência: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

// ─── Payload bruto do webhook (Meta → VIU) ─────────────────────────────────

export interface WhatsAppWebhookPayload {
  object: string // sempre "whatsapp_business_account"
  entry: WhatsAppWebhookEntry[]
}

export interface WhatsAppWebhookEntry {
  id: string // WABA ID
  changes: WhatsAppWebhookChange[]
}

export interface WhatsAppWebhookChange {
  field: string // "messages"
  value: WhatsAppWebhookValue
}

export interface WhatsAppWebhookValue {
  messaging_product: string // "whatsapp"
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: Array<{
    profile: { name: string }
    wa_id: string
  }>
  messages?: WhatsAppInboundMessage[]
  statuses?: WhatsAppMessageStatus[]
}

export interface WhatsAppInboundMessage {
  id: string // wamid — chave de idempotência
  from: string // telefone E.164 sem "+" (ex.: 5511999999999)
  timestamp: string // epoch em segundos, como string
  type: string // text | audio | interactive | button | image | document | ...
  // Resposta a uma mensagem específica (ex.: reply ao card de aprovação)
  context?: { id: string }
  text?: { body: string }
  audio?: { id: string; mime_type: string; voice?: boolean }
  image?: { id: string; mime_type: string; caption?: string }
  interactive?: {
    type: string // button_reply | list_reply
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string }
  }
  // Botões de template (diferente de interactive)
  button?: { payload: string; text: string }
}

export interface WhatsAppMessageStatus {
  id: string // wamid da mensagem ENVIADA a que o status se refere
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string; message?: string }>
}

// ─── Mensagem normalizada (domínio VIU) ────────────────────────────────────

/**
 * Toda mensagem recebida é reduzida a uma destas formas antes de qualquer
 * regra de negócio. Princípio de produto: resposta estruturada (BOTAO) é o
 * caminho feliz; TEXTO e AUDIO são entradas normais — nunca erro.
 */
export type TipoRespostaWhatsApp = 'BOTAO' | 'TEXTO' | 'AUDIO' | 'NAO_SUPORTADO'

export interface MensagemNormalizada {
  waMessageId: string
  telefone: string
  tipo: TipoRespostaWhatsApp
  /** Texto da mensagem (TEXTO) ou título do botão (BOTAO). Vazio para AUDIO até transcrever. */
  conteudo: string
  /** id estruturado do botão, formato "acao:envioId" (ex.: "aprovar:c1a2b3"). */
  botaoId?: string
  /** media id da Meta, para download do áudio. */
  audioId?: string
  /** wamid da mensagem nossa a que o cliente respondeu, se houver. */
  contextoWaMessageId?: string
  timestamp: Date
}

// ─── Ações de botão (VIU → cliente → VIU) ──────────────────────────────────

/**
 * Ids de botão enviados pelo VIU e devolvidos pela Meta em button_reply.
 * Formato: `${AcaoBotao}:${envioId}` — envioId referencia whatsapp_envios.
 */
export const ACOES_BOTAO = {
  /** Aprovação direta a partir do card de solicitação. */
  APROVAR: 'aprovar',
  /** Pedido de alteração a partir de qualquer card. */
  ALTERAR: 'alterar',
  /** Confirmação humana de uma aprovação inferida de resposta livre (Princípio nº 3). */
  CONFIRMAR: 'confirmar',
} as const

export type AcaoBotao = (typeof ACOES_BOTAO)[keyof typeof ACOES_BOTAO]

export function parseBotaoId(botaoId: string): { acao: AcaoBotao; envioId: string } | null {
  const [acao, envioId] = botaoId.split(':')
  if (!envioId) return null
  const acoes = Object.values(ACOES_BOTAO) as string[]
  if (!acoes.includes(acao)) return null
  return { acao: acao as AcaoBotao, envioId }
}
