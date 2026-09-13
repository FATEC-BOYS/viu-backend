import { FastifyInstance } from 'fastify'
import { getResumoAdmin } from '../controllers/adminController.js'
import { entrarComoUsuario, sairDaConta } from '../controllers/impersonacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'

export async function adminRoutes(fastify: FastifyInstance) {
  // A home do admin em uma requisição: seis contagens, o funil e duas listas.
  // Agregação pura — pesa mais que uma leitura comum, daí o teto próprio.
  fastify.get('/admin/resumo', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('ADMIN')],
  }, getResumoAdmin)

  /*
   * Entrar na conta de outra pessoa, somente leitura.
   *
   * `validateCuidParam` não entra aqui porque o parâmetro é lido direto pelo
   * serviço, que já recusa id inexistente com 404 — e o teto por minuto é
   * baixo de propósito: isto não é rota de uso corrente, e um pico nela é
   * exatamente o que se quer enxergar.
   */
  fastify.post('/admin/impersonar/:usuarioId', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('ADMIN')],
  }, entrarComoUsuario)

  /*
   * A saída NÃO exige papel de ADMIN: quem a chama está autenticado como o
   * usuário impersonado, e o token dele carrega o tipo do ALVO. Exigir ADMIN
   * aqui trancaria o admin dentro da conta em que entrou.
   *
   * Quem pode sair é definido pela própria sessão: o serviço recusa qualquer
   * uma que não tenha `impersonadoPorId`.
   */
  fastify.post('/admin/impersonar/sair', {
    preHandler: [authenticate],
  }, sairDaConta)
}
