import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Responde 500 e registra a causa.
 *
 * O padrão da casa era `catch { reply.status(500).send({ message: '...' }) }`.
 * Quando algo quebrava em produção, o log tinha só
 * `{"res":{"statusCode":500}}` e o motivo — R2 fora do ar, credencial errada,
 * banco recusando conexão — morria no catch. Cada investigação começava do
 * zero, adivinhando.
 *
 * A mensagem serve aos dois lados: é o que a pessoa lê e é o que identifica a
 * operação no log. O objeto do erro fica só no log, nunca na resposta —
 * `error.message` de um erro interno costuma carregar caminho de arquivo,
 * nome de tabela e trecho de query, que não são assunto de quem chamou a API.
 */
export function erroInterno(
  request: FastifyRequest,
  reply: FastifyReply,
  erro: unknown,
  mensagem: string,
): void {
  /**
   * A chave tem que ser `err`: `message` e `stack` de um `Error` não são
   * enumeráveis, e o Pino só aplica o serializador de erro nessa chave. Sob
   * qualquer outro nome — `erro`, que era a convenção daqui — o log sai
   * `"erro":{}` e a causa se perde exatamente como quando não havia log
   * nenhum. Erros de biblioteca (AWS, Prisma) enganam, porque têm campos
   * próprios enumeráveis e aparecem mesmo assim.
   */
  request.log.error({ err: erro }, mensagem)
  reply.status(500).send({ message: mensagem, success: false })
}
