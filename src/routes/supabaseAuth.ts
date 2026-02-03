/**
 * Rotas de Autenticação Supabase
 *
 * Endpoints para sincronização de usuários entre Supabase e Prisma
 */

import { FastifyInstance } from 'fastify'
import { syncSupabaseUser, getSupabaseUser } from '../controllers/supabaseAuthController.js'

export async function supabaseAuthRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/supabase/sync
   * Sincroniza usuário autenticado via Supabase com o banco Prisma
   *
   * Body:
   * {
   *   "supabaseId": "uuid-do-supabase",
   *   "email": "usuario@example.com",
   *   "nome": "Nome do Usuário",
   *   "avatar": "https://...", (opcional)
   *   "provider": "google" (google, github, etc)
   * }
   */
  fastify.post('/auth/supabase/sync', syncSupabaseUser)

  /**
   * GET /auth/supabase/user/:supabaseId
   * Busca usuário pelo supabaseId
   */
  fastify.get('/auth/supabase/user/:supabaseId', getSupabaseUser)
}
