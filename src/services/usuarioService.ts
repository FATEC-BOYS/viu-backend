import prisma from '../database/client.js'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto' // Para gerar tokens seguros
import { add } from 'date-fns'

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
   * Cria um novo usuário.
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
   * Atualiza um usuário existente.
   */
  async updateUsuario(id: string, updateData: any) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }
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
   * Realiza o login do usuário, valida as credenciais e CRIA UMA SESSÃO
   * VÁLIDA no banco de dados.
   */
  async login(loginData: any) {
    const usuario = await prisma.usuario.findUnique({
      where: { email: loginData.email },
    })

    if (!usuario || !usuario.ativo) {
      throw new Error('Email ou senha inválidos ou usuário inativo')
    }
    const senhaValida = await bcrypt.compare(loginData.senha, usuario.senha)
    if (!senhaValida) {
      throw new Error('Email ou senha inválidos')
    }

    // Gera um token de sessão seguro e aleatório.
    const token = randomBytes(32).toString('hex');

    // Define a data de expiração da sessão (ex: 7 dias a partir de agora).
    const expiresAt = add(new Date(), { days: 7 });

    // CRIA a sessão no banco de dados, ligando o token ao usuário.
    await prisma.sessao.create({
      data: {
        token,
        expiresAt,
        usuarioId: usuario.id,
      },
    });

    // Retorna o token e os dados do usuário para o frontend.
    return {
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: usuario.avatar,
      },
    };
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
