/**
 * Controller de Autenticação Supabase
 *
 * Sincroniza usuários autenticados via Supabase (Google, etc)
 * com o banco de dados Prisma
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'

interface SyncSupabaseUserBody {
  supabaseId: string
  email: string
  nome: string
  avatar?: string
  provider: string // 'google', 'github', etc
}

/**
 * POST /auth/supabase/sync
 * Sincroniza usuário do Supabase com o banco Prisma
 */
export async function syncSupabaseUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { supabaseId, email, nome, avatar, provider } = request.body as SyncSupabaseUserBody

    // Validação básica
    if (!supabaseId || !email || !nome) {
      reply.status(400).send({
        message: 'Dados obrigatórios: supabaseId, email, nome',
        success: false,
      })
      return
    }

    // Busca usuário existente pelo supabaseId ou email
    let usuario = await prisma.usuario.findFirst({
      where: {
        OR: [
          { supabaseId },
          { email },
        ],
      },
    })

    if (usuario) {
      // Atualiza usuário existente
      usuario = await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          supabaseId,
          email,
          nome,
          avatar: avatar || usuario.avatar,
          provider,
          ativo: true,
        },
      })

      reply.send({
        message: 'Usuário atualizado com sucesso',
        data: {
          id: usuario.id,
          email: usuario.email,
          nome: usuario.nome,
          avatar: usuario.avatar,
          tipo: usuario.tipo,
        },
        success: true,
      })
    } else {
      // Cria novo usuário
      usuario = await prisma.usuario.create({
        data: {
          supabaseId,
          email,
          nome,
          avatar,
          provider,
          tipo: 'DESIGNER', // Padrão
          ativo: true,
        },
      })

      reply.status(201).send({
        message: 'Usuário criado com sucesso',
        data: {
          id: usuario.id,
          email: usuario.email,
          nome: usuario.nome,
          avatar: usuario.avatar,
          tipo: usuario.tipo,
        },
        success: true,
      })
    }
  } catch (error: any) {
    console.error('Erro ao sincronizar usuário Supabase:', error)
    reply.status(500).send({
      message: 'Erro ao sincronizar usuário',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /auth/supabase/user/:supabaseId
 * Busca usuário pelo supabaseId
 */
export async function getSupabaseUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { supabaseId } = request.params as { supabaseId: string }

    const usuario = await prisma.usuario.findUnique({
      where: { supabaseId },
      select: {
        id: true,
        email: true,
        nome: true,
        avatar: true,
        tipo: true,
        telefone: true,
        ativo: true,
        criadoEm: true,
      },
    })

    if (!usuario) {
      reply.status(404).send({
        message: 'Usuário não encontrado',
        success: false,
      })
      return
    }

    reply.send({
      data: usuario,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar usuário',
      error: error.message,
      success: false,
    })
  }
}
