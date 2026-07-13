// src/services/whatsappService.ts
/**
 * Cliente da API oficial do WhatsApp Business (Meta Cloud API) — lado de ENVIO.
 *
 * Toda comunicação VIU → cliente final passa por aqui: card de solicitação de
 * aprovação com botões, confirmação de aprovação inferida (Princípio nº 3),
 * templates (necessários para iniciar conversa fora da janela de 24h) e
 * download de mídia (áudios de resposta).
 *
 * Configuração necessária (.env):
 *   WHATSAPP_ACCESS_TOKEN     — token permanente do system user (Meta Business)
 *   WHATSAPP_PHONE_NUMBER_ID  — id do número emissor no app da Meta
 *   WHATSAPP_APP_SECRET       — para validar assinatura dos webhooks
 *   WHATSAPP_VERIFY_TOKEN     — token de verificação do endpoint (definido por nós)
 */

import axios from 'axios'
import { createHmac, timingSafeEqual } from 'crypto'
import { env } from '../config/env.js'

const GRAPH_BASE = 'https://graph.facebook.com'

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID)
}

function messagesUrl(): string {
  return `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

function authHeaders() {
  return { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }
}

async function postMessage(payload: Record<string, unknown>): Promise<string> {
  if (!isWhatsAppConfigured()) {
    throw new Error('WhatsApp não configurado: defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID')
  }
  const { data } = await axios.post(messagesUrl(), { messaging_product: 'whatsapp', ...payload }, {
    headers: authHeaders(),
    timeout: 10000,
  })
  // wamid da mensagem enviada — persistido em whatsapp_envios para correlacionar respostas
  return data?.messages?.[0]?.id ?? ''
}

// ─── Validação de assinatura do webhook ────────────────────────────────────

/**
 * Valida o header X-Hub-Signature-256 (HMAC-SHA256 do corpo BRUTO com o app
 * secret). Exige o corpo exatamente como recebido — por isso a rota do webhook
 * captura rawBody antes do parse de JSON.
 */
export function validateWhatsAppSignature(rawBody: Buffer, signatureHeader: string): boolean {
  if (!env.WHATSAPP_APP_SECRET) return env.NODE_ENV !== 'production' // dev/test aceita sem validar

  const expectedPrefix = 'sha256='
  if (!signatureHeader.startsWith(expectedPrefix)) return false

  const received = signatureHeader.slice(expectedPrefix.length)
  const computed = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')

  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(computed, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// ─── Envio ─────────────────────────────────────────────────────────────────

export async function enviarTexto(telefone: string, texto: string): Promise<string> {
  return postMessage({
    to: telefone,
    type: 'text',
    text: { body: texto, preview_url: true },
  })
}

/**
 * Card de solicitação de aprovação: preview + botões nativos.
 * O cliente TOCA, não digita — caminho feliz do Princípio nº 1.
 */
export async function enviarSolicitacaoAprovacao(
  telefone: string,
  opts: { envioId: string; arteNome: string; versao: number; linkPreview?: string },
): Promise<string> {
  const corpo = [
    `🎨 *${opts.arteNome}* — versão ${opts.versao}`,
    opts.linkPreview ? `\nVer a arte: ${opts.linkPreview}` : '',
    '\nO que você achou?',
  ].join('\n')

  return postMessage({
    to: telefone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: corpo },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `aprovar:${opts.envioId}`, title: '✅ Aprovar' } },
          { type: 'reply', reply: { id: `alterar:${opts.envioId}`, title: '✏️ Pedir alteração' } },
        ],
      },
    },
  })
}

/**
 * Confirmação de aprovação inferida de resposta livre (Princípio nº 3):
 * a IA sugere, a pessoa confirma. Sem esse toque, nada vira Aprovacao.
 */
export async function enviarConfirmacaoAprovacao(
  telefone: string,
  opts: { envioId: string; arteNome: string; versao: number },
): Promise<string> {
  return postMessage({
    to: telefone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Entendi que você aprovou *${opts.arteNome}* (versão ${opts.versao}). Confirma?`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `confirmar:${opts.envioId}`, title: '✅ Confirmar' } },
          { type: 'reply', reply: { id: `alterar:${opts.envioId}`, title: '✏️ Pedir alteração' } },
        ],
      },
    },
  })
}

/**
 * Template pré-aprovado pela Meta — obrigatório para INICIAR conversa
 * (fora da janela de 24h de atendimento). Os templates em si são criados
 * e aprovados no painel da Meta; aqui só referenciamos pelo nome.
 */
export async function enviarTemplate(
  telefone: string,
  nomeTemplate: string,
  parametrosCorpo: string[] = [],
  idioma = 'pt_BR',
): Promise<string> {
  return postMessage({
    to: telefone,
    type: 'template',
    template: {
      name: nomeTemplate,
      language: { code: idioma },
      components: parametrosCorpo.length
        ? [{ type: 'body', parameters: parametrosCorpo.map((text) => ({ type: 'text', text })) }]
        : [],
    },
  })
}

export async function marcarComoLida(waMessageId: string): Promise<void> {
  await postMessage({ status: 'read', message_id: waMessageId })
}

// ─── Mídia ─────────────────────────────────────────────────────────────────

/**
 * Baixa uma mídia recebida (ex.: áudio de resposta) em dois passos:
 * 1. GET /{media-id} → URL temporária; 2. GET url com o mesmo bearer token.
 */
export async function baixarMidia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!isWhatsAppConfigured()) {
    throw new Error('WhatsApp não configurado: defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID')
  }
  const meta = await axios.get(`${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${mediaId}`, {
    headers: authHeaders(),
    timeout: 10000,
  })
  const arquivo = await axios.get(meta.data.url, {
    headers: authHeaders(),
    responseType: 'arraybuffer',
    timeout: 30000,
  })
  return { buffer: Buffer.from(arquivo.data), mimeType: meta.data.mime_type ?? 'application/octet-stream' }
}
