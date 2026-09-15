import { FastifyRequest, FastifyReply } from 'fastify'
import { recusarCadastro } from '../services/recusaCadastroService.js'
import { erroInterno } from '../utils/erroInterno.js'

/**
 * "Não fui eu", pela pessoa que não tem conta para entrar.
 *
 * Rota pública de propósito: quem recebeu o cadastro sem pedir não tem senha e
 * não deveria precisar criar uma só para poder sair. O que autentica é o token
 * do e-mail — a mesma prova que o convite e o reset de senha usam.
 */
export async function recusarCadastroHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = (request.body ?? {}) as { token?: string }
    if (!token) {
      reply.status(400).send({ message: 'Token ausente.', success: false })
      return
    }

    const { projetosAfetados } = await recusarCadastro(token)

    reply.send({
      message: 'Seus dados foram removidos do VIU.',
      data: { projetosAfetados: projetosAfetados.length },
      success: true,
    })
  } catch (error: any) {
    if (error?.codigo === 'TOKEN_INVALIDO') {
      reply.status(404).send({ message: error.message, codigo: error.codigo, success: false })
      return
    }
    /*
     * 409 e não 403: não é falta de permissão, é conflito com o que já existe
     * na conta. A frase diz o próximo passo, que é o suporte — e é aqui que a
     * decisão sai do automático de propósito, porque apagar apagaria histórico
     * de outras pessoas.
     */
    if (error?.codigo === 'RECUSA_BLOQUEADA') {
      reply.status(409).send({
        message: error.message,
        codigo: error.codigo,
        motivo: error.motivo,
        success: false,
      })
      return
    }
    erroInterno(request, reply, error, 'Erro ao processar a recusa de cadastro')
  }
}
