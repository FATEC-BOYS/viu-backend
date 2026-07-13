// src/services/whatsappEnvioService.ts
/**
 * Disparo de solicitações de aprovação via WhatsApp — lado da AGÊNCIA.
 *
 * Cria o registro WhatsAppEnvio (correlação arte ↔ cliente ↔ telefone) e envia
 * o card interativo. O waMessageId retornado pela Meta é persistido para que
 * statuses e respostas sejam atribuídos ao ciclo correto pelo webhook.
 */

import prisma from '../database/client.js'
import { enviarSolicitacaoAprovacao, isWhatsAppConfigured } from './whatsappService.js'
import { StatusEnvioWhatsApp } from './whatsappWebhookService.js'

export class WhatsAppEnvioError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message)
  }
}

/**
 * Converte telefone armazenado (formato BR livre) para o formato da Meta:
 * E.164 sem "+" (ex.: "(11) 99999-9999" → "5511999999999").
 */
export function normalizarTelefone(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos
  return null
}

export async function criarEnvioAprovacao(
  usuarioId: string,
  tipoUsuario: string,
  arteId: string,
  linkPreview?: string,
) {
  if (!isWhatsAppConfigured()) {
    throw new WhatsAppEnvioError('Integração com WhatsApp não configurada', 503)
  }

  const arte = await prisma.arte.findUnique({
    where: { id: arteId },
    include: {
      projeto: {
        select: {
          designerId: true,
          cliente: { select: { id: true, nome: true, telefone: true } },
        },
      },
    },
  })
  if (!arte) throw new WhatsAppEnvioError('Arte não encontrada', 404)

  // Só o designer do projeto (ou admin) dispara solicitação de aprovação
  if (arte.projeto.designerId !== usuarioId && tipoUsuario !== 'ADMIN') {
    throw new WhatsAppEnvioError('Sem permissão para solicitar aprovação desta arte', 403)
  }

  const cliente = arte.projeto.cliente
  if (!cliente.telefone) {
    throw new WhatsAppEnvioError('Cliente não possui telefone cadastrado', 422)
  }
  const telefone = normalizarTelefone(cliente.telefone)
  if (!telefone) {
    throw new WhatsAppEnvioError('Telefone do cliente em formato inválido', 422)
  }

  // Evita duas solicitações ativas para a mesma arte/cliente — o lembrete
  // automático (futuro) reusa o envio existente em vez de criar outro card
  const ativo = await prisma.whatsAppEnvio.findFirst({
    where: {
      arteId,
      clienteId: cliente.id,
      status: {
        in: [
          StatusEnvioWhatsApp.AGUARDANDO_RESPOSTA,
          StatusEnvioWhatsApp.AGUARDANDO_CONFIRMACAO,
          StatusEnvioWhatsApp.AGUARDANDO_DETALHES,
        ],
      },
    },
  })
  if (ativo) {
    throw new WhatsAppEnvioError('Já existe uma solicitação de aprovação ativa para esta arte', 409)
  }

  const envio = await prisma.whatsAppEnvio.create({
    data: { telefone, arteId, clienteId: cliente.id },
  })

  try {
    const waMessageId = await enviarSolicitacaoAprovacao(telefone, {
      envioId: envio.id,
      arteNome: arte.nome,
      versao: arte.versao,
      linkPreview,
    })
    return prisma.whatsAppEnvio.update({
      where: { id: envio.id },
      data: { waMessageId },
    })
  } catch (err: any) {
    await prisma.whatsAppEnvio.update({
      where: { id: envio.id },
      data: { status: StatusEnvioWhatsApp.FALHOU, erro: String(err?.message ?? err) },
    })
    throw new WhatsAppEnvioError('Falha ao enviar mensagem pelo WhatsApp', 502)
  }
}

export async function listarEnviosPorArte(usuarioId: string, tipoUsuario: string, arteId: string) {
  const arte = await prisma.arte.findUnique({
    where: { id: arteId },
    select: { projeto: { select: { designerId: true, clienteId: true } } },
  })
  if (!arte) throw new WhatsAppEnvioError('Arte não encontrada', 404)
  const ehParte = arte.projeto.designerId === usuarioId || arte.projeto.clienteId === usuarioId
  if (!ehParte && tipoUsuario !== 'ADMIN') {
    throw new WhatsAppEnvioError('Sem permissão para ver os envios desta arte', 403)
  }

  return prisma.whatsAppEnvio.findMany({
    where: { arteId },
    orderBy: { criadoEm: 'desc' },
  })
}
