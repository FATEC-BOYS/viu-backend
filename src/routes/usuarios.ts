import { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
import {
  listUsuarios,
  getUsuarioById,
  createUsuario,
  resolverClienteHandler,
  updateUsuario,
  deactivateUsuario,
  loginUsuario,
  getCurrentUser,
  statsOverview,
  uploadAvatar,
  buscarUsuarios,
} from '../controllers/usuarioController.js'
import {
  validateCreateUsuario,
  validateResolverCliente,
  exigirAceiteDosTermos,
  validateUpdateUsuario,
  validateLogin,
  restringirCriacaoACliente,
} from '../middleware/usuarioMiddleware.js'
import { listarClientesHandler, getClienteHandler } from '../controllers/clienteController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { recusarCadastroHandler } from '../controllers/recusaCadastroController.js'
import { requireOwnership, requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'
import {
  limitarRegistroPublico,
  limitarCriacaoDeCliente,
} from '../middleware/registroLimiteMiddleware.js'
import { verificarCaptchaDoCadastro } from '../middleware/captchaMiddleware.js'
import { validateFileUpload } from '../middleware/fileUploadMiddleware.js'

export async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.get('/usuarios', { preHandler: [authenticate, requireRole('ADMIN'), validatePagination] }, listUsuarios)

  // busca leve para typeahead (qualquer usuário autenticado, campos mínimos)
  fastify.get('/usuarios/buscar', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: [authenticate],
  }, buscarUsuarios)

  fastify.get('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, getUsuarioById)

  // Cadastro de cliente pelo designer (ClienteWizard). Não é porta de
  // cadastro público: exige sessão e só cria CLIENTE. Sem isso, o mesmo
  // handler do registro ficava acessível sem autenticação, com balde de
  // limite próprio — alternar as duas rotas dobrava o teto de contas por IP.
  fastify.post('/usuarios', {
    preHandler: [authenticate, restringirCriacaoACliente, limitarCriacaoDeCliente, validateCreateUsuario],
  }, createUsuario)

  /*
   * "Quem é o cliente deste projeto?" — a pergunta que o wizard faz de fato.
   *
   * Rota própria, e não mudança em `POST /usuarios`: aquele handler é
   * compartilhado com `/auth/register`, e o cadastro público TEM que continuar
   * recusando e-mail repetido. Resolver por lá abriria um caminho para tomar
   * conta alheia.
   *
   * Mesmo balde de `POST /usuarios` (`CLIENTES_MAX_HORA`, por designer): é ele
   * que limita quantos e-mails alguém pode testar para descobrir quem tem
   * conta no VIU.
   */
  fastify.post('/clientes', {
    preHandler: [authenticate, limitarCriacaoDeCliente, validateResolverCliente],
  }, resolverClienteHandler)

  /*
   * A carteira do designer, montada pelo banco.
   *
   * Vivia só no navegador: as duas telas de cliente chamavam `getAll
   * ('/projetos')` e agrupavam em memória — todos os projetos baixados para
   * desenhar uma lista de cinco pessoas, com `getAll` parando na vigésima
   * página em silêncio.
   *
   * Não precisa de guarda de papel: o escopo É a resposta. Só saem clientes de
   * projetos deste designer, que é exatamente o que ele já enxergava.
   *
   * Estática antes da paramétrica não importa aqui (não há `/clientes/:id`
   * conflitante em POST), mas a ordem de declaração segue a do arquivo.
   */
  fastify.get('/clientes', { preHandler: [authenticate] }, listarClientesHandler)
  fastify.get('/clientes/:id', { preHandler: [authenticate] }, getClienteHandler)

  // Única porta pública de cadastro. O limite por hora e o teto diário vivem
  // no middleware porque precisam valer para o conjunto, não por rota.
  fastify.post('/auth/register', {
    preHandler: [limitarRegistroPublico, verificarCaptchaDoCadastro, validateCreateUsuario, exigirAceiteDosTermos],
  }, createUsuario)

  /*
   * Pública: quem foi cadastrado sem pedir não tem senha, e exigir conta para
   * poder sair seria exigir que a pessoa aceite o cadastro para recusá-lo.
   * Quem autentica é o token do e-mail. Limite apertado porque o token é
   * sorteado de 32 bytes — ninguém acerta por tentativa, e o teto só barra
   * quem tenta.
   */
  fastify.post('/conta/recusar-cadastro', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, recusarCadastroHandler)

  fastify.post('/auth/login', {
    // Teto por IP a cada 15 min — bloqueia brute-force sem prejudicar usuário
    // normal. Ajustável por env porque o valor certo depende de quantas
    // pessoas dividem o mesmo IP de saída.
    config: { rateLimit: { max: env.LOGIN_MAX_15MIN, timeWindow: '15 minutes' } },
    preHandler: [validateLogin],
  }, loginUsuario)

  fastify.get('/auth/me', { preHandler: [authenticate] }, getCurrentUser)

  fastify.put(
    '/usuarios/:id',
    { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario'), validateUpdateUsuario] },
    updateUsuario,
  )

  fastify.delete('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, deactivateUsuario)

  fastify.post('/usuarios/:id/avatar', {
    // 30 uploads de avatar por hora
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    preHandler: [authenticate, validateCuidParam, validateFileUpload],
  }, uploadAvatar)

  fastify.get('/usuarios/stats/overview', { preHandler: [authenticate, requireRole('ADMIN')] }, statsOverview)
}
