// Este arquivo foi deprecado.
// Autenticação agora é feita via POST /usuarios/login (retorna JWT).
// Nenhuma rota é registrada aqui.
import { FastifyInstance } from 'fastify'
export async function supabaseAuthRoutes(_fastify: FastifyInstance) {}
