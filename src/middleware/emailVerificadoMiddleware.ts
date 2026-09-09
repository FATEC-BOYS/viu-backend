import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { env } from '../config/env.js'

/**
 * Exige e-mail confirmado para ações que criam dado caro (projeto, arte,
 * versão, link compartilhado). Ler e navegar continua liberado — quem acabou
 * de se cadastrar precisa conseguir olhar o produto.
 *
 * Consulta o banco em vez de ler o JWT de propósito. O token é uma fotografia
 * do momento em que foi emitido: alguém que confirma o e-mail agora
 * continuaria carregando `emailVerificado: false` até a sessão renovar, e o
 * botão "Já verifiquei" da tela não teria efeito nenhum. É uma consulta por
 * ação de escrita, não por página.
 *
 * O código `EMAIL_NAO_VERIFICADO` no corpo existe para o frontend distinguir
 * este 403 de uma falta de permissão de verdade e abrir o convite para
 * confirmar, em vez de um "acesso negado" que não diz o que fazer.
 */
export async function requireEmailVerificado(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!env.EXIGIR_EMAIL_VERIFICADO) return

  const usuario = (request as any).usuario
  if (!usuario?.id) return // sem sessão: quem responde é o authenticate

  const atual = await prisma.usuario.findUnique({
    where: { id: usuario.id },
    select: { emailVerificado: true },
  })

  if (!atual?.emailVerificado) {
    reply.status(403).send({
      message: 'Confirme seu e-mail para continuar. Enviamos um link no seu cadastro.',
      codigo: 'EMAIL_NAO_VERIFICADO',
      success: false,
    })
  }
}
