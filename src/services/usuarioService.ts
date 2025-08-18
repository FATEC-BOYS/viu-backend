// src/services/usuarioService.ts
/**
 * Serviço de Usuários
 *
 * Esta camada centraliza a lógica de negócios associada aos usuários,
 * incluindo operações CRUD, autenticação e obtenção de estatísticas. As
 * regras de negócio como verificação de e‑mail duplicado e hashing de
 * senha são implementadas aqui.
 */

import prisma from '../database/client.js'
import bcrypt from 'bcryptjs'

export interface ListUsuariosParams {
  page?: number
  limit?: number
  tipo?: string
  ativo?: string | boolean
}

export class UsuarioService {
  /**
   * Lista usuários com paginação e filtros por tipo e ativo.
   */
  async listUsuarios({ page = 1, limit = 10, tipo, ativo }: ListUsuariosParams) {
    const skip = (page - 1) * limit
    // Converte string 'true'/'false' em boolean se necessário
    let ativoFilter: boolean | undefined
    if (ativo !== undefined && ativo !== null) {
      if (typeof ativo === 'string') {
        ativoFilter = ativo === 'true'
      } else {
        ativoFilter = ativo
      }
    }
    const where: any = {
      ...(tipo && { tipo }),
      ...(ativoFilter !== undefined && { ativo: ativoFilter }),
    }
    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: Number(limit),
        select: {
          id: true,
          email: true,
          nome: true,
          telefone: true,
          avatar: true,
          tipo: true,
          ativo: true,
          criadoEm: true,
          _count: {
            select: {
              projetosDesigner: true,
              projetosCliente: true,
              artes: true,
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.usuario.count({ where }),
    ])
    return { usuarios, total }
  }

  /**
   * Busca um usuário por ID.
   */
  async getUsuarioById(id: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        criadoEm: true,
        atualizadoEm: true,
        _count: {
          select: {
            projetosDesigner: true,
            projetosCliente: true,
            artes: true,
            feedbacks: true,
            aprovacoes: true,
            tarefas: true,
          },
        },
      },
    })
    return usuario
  }

  /**
   * Cria um novo usuário, verificando duplicidade de email e fazendo hash da senha.
   * @throws Error quando o e‑mail já está em uso.
   */
  async createUsuario(userData: any) {
    const existingUser = await prisma.usuario.findUnique({
      where: { email: userData.email },
    })
    if (existingUser) {
      throw new Error('Email já está em uso')
    }
    const senhaHash = await bcrypt.hash(userData.senha, 10)
    const usuario = await prisma.usuario.create({
      data: {
        ...userData,
        senha: senhaHash,
      },
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        criadoEm: true,
      },
    })
    return usuario
  }

  /**
   * Atualiza um usuário existente. Verifica duplicidade de e‑mail quando
   * necessário e realiza hash da nova senha se fornecida.
   * @throws Error se o usuário não existir ou se o e‑mail já estiver em uso.
   */
  async updateUsuario(id: string, updateData: any) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }
    // Verificar se está alterando o e‑mail para um que já existe
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.usuario.findUnique({ where: { email: updateData.email } })
      if (emailExists) {
        throw new Error('Email já está em uso')
      }
    }
    const dataToUpdate: any = { ...updateData }
    if (updateData.senha) {
      dataToUpdate.senha = await bcrypt.hash(updateData.senha, 10)
    }
    const usuario = await prisma.usuario.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        atualizadoEm: true,
      },
    })
    return usuario
  }

  /**
   * Desativa (soft delete) um usuário.
   */
  async deactivateUsuario(id: string) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }
    await prisma.usuario.update({
      where: { id },
      data: { ativo: false },
    })
    return
  }

  /**
   * Realiza o login do usuário verificando e‑mail, estado ativo e senha.
   * Retorna um token simulado e dados básicos do usuário.
   * @throws Error quando as credenciais são inválidas ou o usuário está inativo.
   */
  async login(loginData: any) {
    const usuario = await prisma.usuario.findUnique({
      where: { email: loginData.email },
    })
    if (!usuario || !usuario.ativo) {
      throw new Error('Email ou senha inválidos')
    }
    const senhaValida = await bcrypt.compare(loginData.senha, usuario.senha)
    if (!senhaValida) {
      throw new Error('Email ou senha inválidos')
    }
    // Simulação de geração de token (substituir por implementação real de JWT)
    const token = `fake_jwt_token_${usuario.id}_${Date.now()}`
    return {
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: usuario.avatar,
      },
    }
  }

  /**
   * Calcula estatísticas para painel de usuários.
   */
  async statsOverview() {
    const [total, designers, clientes, admins, ativos] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { tipo: 'DESIGNER' } }),
      prisma.usuario.count({ where: { tipo: 'CLIENTE' } }),
      prisma.usuario.count({ where: { tipo: 'ADMIN' } }),
      prisma.usuario.count({ where: { ativo: true } }),
    ])
    return {
      total,
      porTipo: {
        designers,
        clientes,
        admins,
      },
      ativos,
      inativos: total - ativos,
      percentualAtivos: total > 0 ? Math.round((ativos / total) * 100) : 0,
    }
  }
}