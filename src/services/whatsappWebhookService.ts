// src/services/whatsappWebhookService.ts
/**
 * Processamento de webhooks do WhatsApp (Meta Cloud API) — lado de RECEPÇÃO.
 *
 * Fluxo: o controller valida a assinatura, responde 200 imediatamente e delega
 * para cá de forma assíncrona (mesmo padrão do webhook do MercadoPago).
 * Cada mensagem é deduplicada via WebhookLog (unique em externalId = wamid),
 * normalizada para MensagemNormalizada e despachada por tipo.
 *
 * Princípios de produto aplicados (ver DIRECIONAMENTO.md):
 *  - nº 1: o cliente final responde onde já está; resposta livre nunca é erro.
 *  - nº 3: a IA nunca decide — aprovação inferida de texto/áudio exige um
 *    toque de confirmação antes de virar registro de Aprovacao.
 */

import prisma from '../database/client.js'
import { transcreverAudio } from './transcricaoService.js'
import {
  baixarMidia,
  enviarConfirmacaoAprovacao,
  enviarTexto,
} from './whatsappService.js'
import {
  MensagemNormalizada,
  WhatsAppInboundMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhookPayload,
  parseBotaoId,
} from '../types/whatsapp.js'
import { StatusAprovacao, StatusArte, TipoFeedback, TipoNotificacao, CanalNotificacao } from '../types/enums.js'

// Status possíveis de um WhatsAppEnvio (espelha o comentário no schema.prisma)
export const StatusEnvioWhatsApp = {
  AGUARDANDO_RESPOSTA: 'AGUARDANDO_RESPOSTA',
  AGUARDANDO_CONFIRMACAO: 'AGUARDANDO_CONFIRMACAO',
  AGUARDANDO_DETALHES: 'AGUARDANDO_DETALHES',
  APROVADA: 'APROVADA',
  ALTERACAO_REGISTRADA: 'ALTERACAO_REGISTRADA',
  FALHOU: 'FALHOU',
} as const

const STATUS_ATIVOS = [
  StatusEnvioWhatsApp.AGUARDANDO_RESPOSTA,
  StatusEnvioWhatsApp.AGUARDANDO_CONFIRMACAO,
  StatusEnvioWhatsApp.AGUARDANDO_DETALHES,
]

// ─── Normalização ──────────────────────────────────────────────────────────

export function normalizarMensagem(msg: WhatsAppInboundMessage): MensagemNormalizada {
  const base = {
    waMessageId: msg.id,
    telefone: msg.from,
    contextoWaMessageId: msg.context?.id,
    timestamp: new Date(Number(msg.timestamp) * 1000),
  }

  if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    return {
      ...base,
      tipo: 'BOTAO',
      conteudo: msg.interactive.button_reply.title,
      botaoId: msg.interactive.button_reply.id,
    }
  }
  // Botão de template (quick reply) chega como type "button" com payload
  if (msg.type === 'button' && msg.button) {
    return { ...base, tipo: 'BOTAO', conteudo: msg.button.text, botaoId: msg.button.payload }
  }
  if (msg.type === 'text' && msg.text) {
    return { ...base, tipo: 'TEXTO', conteudo: msg.text.body }
  }
  if (msg.type === 'audio' && msg.audio) {
    return { ...base, tipo: 'AUDIO', conteudo: '', audioId: msg.audio.id }
  }
  return { ...base, tipo: 'NAO_SUPORTADO', conteudo: '' }
}

// ─── Interpretação de resposta livre ───────────────────────────────────────

export type Interpretacao = 'APROVACAO' | 'ALTERACAO' | 'INDEFINIDO'

/**
 * Heurística inicial por palavras-chave. Evoluirá para classificação via LLM,
 * mas o contrato não muda: o retorno é uma SUGESTÃO. Aprovação inferida só
 * vira registro após o toque de confirmação do cliente (Princípio nº 3).
 */
export function interpretarResposta(texto: string): Interpretacao {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const sinaisAlteracao = ['muda', 'mudar', 'altera', 'troca', 'trocar', 'ajusta', 'ajuste', 'corrig', 'nao gostei', 'não gostei', 'refaz', 'tira', 'tirar', 'aumenta', 'diminui']
  if (sinaisAlteracao.some((s) => t.includes(s))) return 'ALTERACAO'

  const sinaisAprovacao = ['aprovado', 'aprovo', 'aprova', 'ta bom', 'tá bom', 'ta otimo', 'ta otima', 'perfeito', 'perfeita', 'gostei', 'pode seguir', 'pode subir', 'pode postar', 'fechado', 'show', 'top', 'ok', 'okay', 'blz', 'beleza', 'joia', 'jóia', '👍', 'amei', 'ficou otimo', 'ficou otima', 'ficou bom', 'ficou boa']
  if (sinaisAprovacao.some((s) => t.includes(s))) return 'APROVACAO'

  return 'INDEFINIDO'
}

// ─── Entrada principal (chamada pelo controller, pós-200) ─────────────────

export async function processarWebhookWhatsAppAsync(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue
      for (const status of change.value.statuses ?? []) {
        await processarStatus(status).catch((err) =>
          console.error('[whatsapp] erro ao processar status:', err),
        )
      }
      for (const msg of change.value.messages ?? []) {
        await processarMensagem(msg).catch((err) =>
          console.error('[whatsapp] erro ao processar mensagem:', err),
        )
      }
    }
  }
}

// ─── Statuses (sent/delivered/read/failed) ─────────────────────────────────

async function processarStatus(status: WhatsAppMessageStatus): Promise<void> {
  if (status.status !== 'failed') return // sent/delivered/read: sem ação por ora
  await prisma.whatsAppEnvio.updateMany({
    where: { waMessageId: status.id },
    data: {
      status: StatusEnvioWhatsApp.FALHOU,
      erro: status.errors?.map((e) => `${e.code}: ${e.title}`).join('; ') ?? 'Falha no envio',
    },
  })
}

// ─── Mensagens recebidas ───────────────────────────────────────────────────

async function processarMensagem(msg: WhatsAppInboundMessage): Promise<void> {
  const externalId = `wa-msg-${msg.id}`

  // Unique em externalId impede reprocessar o mesmo wamid (Meta reenvia em timeout)
  try {
    await prisma.webhookLog.create({
      data: { externalId, tipo: 'whatsapp_message', payload: msg as any, status: 'RECEBIDO' },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      console.info(`[whatsapp] mensagem duplicada ignorada: ${externalId}`)
      return
    }
    throw err
  }

  try {
    const normalizada = normalizarMensagem(msg)
    await despachar(normalizada)
    await prisma.webhookLog.update({
      where: { externalId },
      data: { status: 'PROCESSADO', processadoEm: new Date() },
    })
  } catch (err: any) {
    await prisma.webhookLog.update({
      where: { externalId },
      data: { status: 'ERRO', erro: String(err?.message ?? err), tentativas: { increment: 1 } },
    })
  }
}

async function despachar(m: MensagemNormalizada): Promise<void> {
  switch (m.tipo) {
    case 'BOTAO':
      return processarBotao(m)
    case 'TEXTO':
      return processarRespostaLivre(m, m.conteudo, TipoFeedback.TEXTO)
    case 'AUDIO':
      return processarAudio(m)
    case 'NAO_SUPORTADO':
      await enviarTexto(
        m.telefone,
        'Ainda não consigo processar esse tipo de mensagem por aqui. Você pode responder por texto, áudio ou pelos botões. 🙂',
      )
      return
  }
}

// ─── Botões ────────────────────────────────────────────────────────────────

async function processarBotao(m: MensagemNormalizada): Promise<void> {
  const parsed = m.botaoId ? parseBotaoId(m.botaoId) : null
  if (!parsed) {
    console.warn(`[whatsapp] botaoId não reconhecido: ${m.botaoId}`)
    return
  }

  const envio = await prisma.whatsAppEnvio.findUnique({
    where: { id: parsed.envioId },
    include: { arte: { select: { id: true, nome: true, versao: true, autorId: true } } },
  })
  if (!envio) {
    console.warn(`[whatsapp] envio não encontrado: ${parsed.envioId}`)
    return
  }
  // O toque só vale se vier do telefone para o qual a solicitação foi enviada
  if (envio.telefone !== m.telefone) {
    console.warn(`[whatsapp] telefone divergente para envio ${envio.id} — ignorado`)
    return
  }

  switch (parsed.acao) {
    case 'aprovar':
    case 'confirmar':
      await registrarAprovacao(envio, m)
      return
    case 'alterar':
      await prisma.whatsAppEnvio.update({
        where: { id: envio.id },
        data: {
          status: StatusEnvioWhatsApp.AGUARDANDO_DETALHES,
          respostaTipo: 'BOTAO',
          respostaEm: m.timestamp,
        },
      })
      await enviarTexto(
        m.telefone,
        'Sem problema! O que você gostaria de mudar? Pode responder por texto ou mandar um áudio. 🎤',
      )
      return
  }
}

// ─── Resposta livre (texto ou transcrição de áudio) ────────────────────────

async function processarAudio(m: MensagemNormalizada): Promise<void> {
  if (!m.audioId) return
  const { buffer } = await baixarMidia(m.audioId)
  const transcricao = await transcreverAudio(buffer, 'audio.ogg')
  await processarRespostaLivre(m, transcricao, TipoFeedback.AUDIO)
}

async function processarRespostaLivre(
  m: MensagemNormalizada,
  conteudo: string,
  tipoFeedback: string,
): Promise<void> {
  const envio = await encontrarEnvioAtivo(m.telefone)
  if (!envio) {
    // Sem solicitação ativa: nada para correlacionar. Registrado no WebhookLog;
    // não respondemos para não virar bot tagarela no WhatsApp de ninguém.
    console.info(`[whatsapp] resposta livre sem envio ativo (${m.telefone}) — apenas logada`)
    return
  }

  // Cliente tocou em "Pedir alteração" e está detalhando: vira Feedback direto.
  if (envio.status === StatusEnvioWhatsApp.AGUARDANDO_DETALHES) {
    await registrarAlteracao(envio, m, conteudo, tipoFeedback)
    return
  }

  const interpretacao = interpretarResposta(conteudo)

  if (interpretacao === 'APROVACAO') {
    // Princípio nº 3: inferência não registra — pede um toque de confirmação.
    await prisma.whatsAppEnvio.update({
      where: { id: envio.id },
      data: {
        status: StatusEnvioWhatsApp.AGUARDANDO_CONFIRMACAO,
        respostaTipo: tipoFeedback,
        respostaConteudo: conteudo,
        respostaEm: m.timestamp,
      },
    })
    await enviarConfirmacaoAprovacao(m.telefone, {
      envioId: envio.id,
      arteNome: envio.arte.nome,
      versao: envio.arte.versao,
    })
    return
  }

  if (interpretacao === 'ALTERACAO') {
    await registrarAlteracao(envio, m, conteudo, tipoFeedback)
    return
  }

  // INDEFINIDO: guarda como feedback público na arte, sem mudar o estado do
  // envio — a Hipótese 0 (DIRECIONAMENTO.md) vai nos dizer o quão comum é isso.
  await prisma.feedback.create({
    data: {
      conteudo,
      tipo: tipoFeedback,
      transcricao: tipoFeedback === TipoFeedback.AUDIO ? conteudo : undefined,
      arteId: envio.arteId,
      autorId: envio.clienteId,
    },
  })
}

// ─── Efeitos de domínio ────────────────────────────────────────────────────

type EnvioComArte = {
  id: string
  arteId: string
  clienteId: string
  telefone: string
  arte: { id: string; nome: string; versao: number; autorId: string }
}

async function registrarAprovacao(envio: EnvioComArte, m: MensagemNormalizada): Promise<void> {
  await prisma.$transaction([
    prisma.aprovacao.create({
      data: {
        arteId: envio.arteId,
        aprovadorId: envio.clienteId,
        status: StatusAprovacao.APROVADO,
        comentario: `Aprovado via WhatsApp (wamid: ${m.waMessageId})`,
      },
    }),
    prisma.arte.update({
      where: { id: envio.arteId },
      data: { status: StatusArte.APROVADO },
    }),
    prisma.whatsAppEnvio.update({
      where: { id: envio.id },
      data: {
        status: StatusEnvioWhatsApp.APROVADA,
        respostaTipo: m.tipo,
        respostaEm: m.timestamp,
      },
    }),
    prisma.notificacao.create({
      data: {
        usuarioId: envio.arte.autorId,
        tipo: TipoNotificacao.APROVACAO,
        titulo: 'Arte aprovada pelo WhatsApp 🎉',
        conteudo: `"${envio.arte.nome}" (v${envio.arte.versao}) foi aprovada pelo cliente.`,
        canal: CanalNotificacao.SISTEMA,
      },
    }),
  ])

  await enviarTexto(
    envio.telefone,
    `Aprovação registrada! ✅\n*${envio.arte.nome}* (versão ${envio.arte.versao}) — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  )
}

async function registrarAlteracao(
  envio: EnvioComArte & { status?: string },
  m: MensagemNormalizada,
  conteudo: string,
  tipoFeedback: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.feedback.create({
      data: {
        conteudo,
        tipo: tipoFeedback,
        transcricao: tipoFeedback === TipoFeedback.AUDIO ? conteudo : undefined,
        arteId: envio.arteId,
        autorId: envio.clienteId,
      },
    }),
    prisma.arte.update({
      where: { id: envio.arteId },
      data: { status: StatusArte.REVISAO },
    }),
    prisma.whatsAppEnvio.update({
      where: { id: envio.id },
      data: {
        status: StatusEnvioWhatsApp.ALTERACAO_REGISTRADA,
        respostaTipo: tipoFeedback,
        respostaConteudo: conteudo,
        respostaEm: m.timestamp,
      },
    }),
    prisma.notificacao.create({
      data: {
        usuarioId: envio.arte.autorId,
        tipo: TipoNotificacao.NOVO_FEEDBACK,
        titulo: 'Cliente pediu alteração pelo WhatsApp ✏️',
        conteudo: `"${envio.arte.nome}" (v${envio.arte.versao}): ${conteudo.slice(0, 200)}`,
        canal: CanalNotificacao.SISTEMA,
      },
    }),
  ])

  await enviarTexto(
    envio.telefone,
    'Anotado! ✏️ Já passei o pedido de alteração para a equipe. Você recebe a nova versão por aqui.',
  )
}

async function encontrarEnvioAtivo(telefone: string): Promise<EnvioComArte & { status: string } | null> {
  return prisma.whatsAppEnvio.findFirst({
    where: { telefone, status: { in: STATUS_ATIVOS } },
    orderBy: { criadoEm: 'desc' },
    include: { arte: { select: { id: true, nome: true, versao: true, autorId: true } } },
  }) as any
}
