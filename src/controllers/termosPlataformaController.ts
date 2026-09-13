import { FastifyRequest, FastifyReply } from 'fastify'
import {
  termosVigentes,
  estadoAceiteTermos,
  registrarAceiteTermos,
} from '../services/termosPlataformaService.js'
import { erroInterno } from '../utils/erroInterno.js'

/**
 * Público, e de propósito: ninguém deveria precisar de conta para ler o que
 * vai aceitar ao criar uma. O formulário de cadastro liga para cá.
 */
export async function getTermos(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    reply.send({ data: termosVigentes(), success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao carregar os termos')
  }
}

/**
 * O estado do aceite de quem está logado.
 *
 * Existe porque nem toda conta nasce pelo cadastro público: o designer cadastra
 * o cliente dele pelo wizard, e esse cliente nunca esteve na frente de uma tela
 * para aceitar. `aceitouVigente: false` é a verdade sobre essas contas, e é o
 * que permite pedir o aceite depois em vez de fingir que ele existe.
 */
export async function getAceiteTermos(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    reply.send({ data: await estadoAceiteTermos(usuario.id), success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao consultar o aceite')
  }
}

/** Aceitar depois — conta criada por terceiro, ou redação nova. */
export async function postAceiteTermos(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    await registrarAceiteTermos({
      usuarioId: usuario.id,
      ip: request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
      userAgent: request.headers['user-agent'],
    })
    reply.send({ data: await estadoAceiteTermos(usuario.id), success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao registrar o aceite')
  }
}
