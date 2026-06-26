import prisma from '../database/client.js'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { getJWTSecret, env } from '../config/env.js'
import { randomUUID, randomBytes } from 'crypto'

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface ListUsuariosParams {
  page?: number
  limit?: number
  tipo?: string
  ativo?: string | boolean
}

function parseJwtExpiry(expiry: string): Date {
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match || !match[1] || !match[2]) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const value = parseInt(match[1], 10)
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 } as const
  return new Date(Date.now() + value * (multipliers[unit] ?? 86400000))
}

export class UsuarioService {
  private async signToken(usuario: {
    id: string
    email: string
    nome: string
    tipo: string
  }): Promise<{ token: string; expiresAt: Date; refreshToken: string; refreshExpiresAt: Date }> {
    const secret = new TextEncoder().encode(getJWTSecret())
    const jti = randomUUID()
    const expiresAt = parseJwtExpiry(env.JWT_EXPIRES_IN)
    const token = await new SignJWT({
      email: usuario.email,
      nome: usuario.nome,
      tipo: usuario.tipo,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario.id)
      .setExpirationTime(env.JWT_EXPIRES_IN)
      .setIssuedAt()
      .setJti(jti)
      .sign(secret)

    const refreshToken = randomBytes(32).toString('hex')
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    return { token, expiresAt, refreshToken, refreshExpiresAt }
  }

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

  async createUsuario(userData: any) {
    const existingUser = await prisma.usuario.findUnique({
      where: { email: userData.email },
    })
    if (existingUser) {
      throw new Error('Email já está em uso')
    }
    const senhaHash = await bcrypt.hash(userData.senha, 10)
    const usuario = await prisma.usuario.create({
      data: { ...userData, senha: senhaHash },
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
    // Whitelist-only — never allow tipo, ativo, twoFactor*, id via this endpoint
    const dataToUpdate: Record<string, any> = {}
    const allowedFields = ['email', 'nome', 'telefone', 'avatar'] as const
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) dataToUpdate[field] = updateData[field]
    }
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

  async deactivateUsuario(id: string) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }
    await prisma.usuario.update({ where: { id }, data: { ativo: false } })
  }

  async login(loginData: any) {
    const usuario = await prisma.usuario.findUnique({
      where: { email: loginData.email },
      select: {
        id: true,
        email: true,
        senha: true,
        nome: true,
        tipo: true,
        avatar: true,
        ativo: true,
        twoFactorEnabled: true,
      },
    })

    if (!usuario || !usuario.ativo) {
      throw new Error('Email ou senha inválidos ou usuário inativo')
    }

    if (!usuario.senha) {
      throw new Error(
        'Esta conta foi criada com login social. Use o método de login original.',
      )
    }

    const senhaValida = await bcrypt.compare(loginData.senha, usuario.senha)
    if (!senhaValida) {
      throw new Error('Email ou senha inválidos')
    }

    if (usuario.twoFactorEnabled) {
      return {
        requires2FA: true,
        userId: usuario.id,
        message: 'Verificação de 2FA necessária',
      }
    }

    const { token, expiresAt, refreshToken, refreshExpiresAt } = await this.signToken(usuario)

    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: usuario.id, refreshToken, refreshExpiresAt },
    })

    return {
      token,
      refreshToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: usuario.avatar,
      },
    }
  }

  async refresh(refreshToken: string) {
    const sessao = await prisma.sessao.findFirst({
      where: {
        refreshToken,
        ativo: true,
        refreshExpiresAt: { gt: new Date() },
      },
      include: {
        usuario: {
          select: { id: true, email: true, nome: true, tipo: true, avatar: true, ativo: true },
        },
      },
    })

    if (!sessao || !sessao.usuario.ativo) {
      throw new Error('Refresh token inválido ou expirado')
    }

    // Revoke old session (token rotation)
    await prisma.sessao.update({ where: { id: sessao.id }, data: { ativo: false } })

    const { token, expiresAt, refreshToken: newRefresh, refreshExpiresAt } = await this.signToken(sessao.usuario)
    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: sessao.usuarioId, refreshToken: newRefresh, refreshExpiresAt },
    })

    return {
      token,
      refreshToken: newRefresh,
      usuario: {
        id: sessao.usuario.id,
        email: sessao.usuario.email,
        nome: sessao.usuario.nome,
        tipo: sessao.usuario.tipo,
        avatar: sessao.usuario.avatar,
      },
    }
  }

  async logout(token: string) {
    await prisma.sessao.updateMany({ where: { token }, data: { ativo: false } })
  }

  async completeTwoFactorLogin(userId: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nome: true,
        tipo: true,
        avatar: true,
        ativo: true,
      },
    })

    if (!usuario || !usuario.ativo) {
      throw new Error('Usuário não encontrado ou inativo')
    }

    const { token, expiresAt, refreshToken, refreshExpiresAt } = await this.signToken(usuario)

    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: usuario.id, refreshToken, refreshExpiresAt },
    })

    return {
      token,
      refreshToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: usuario.avatar,
      },
    }
  }

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
      porTipo: { designers, clientes, admins },
      ativos,
      inativos: total - ativos,
      percentualAtivos: total > 0 ? Math.round((ativos / total) * 100) : 0,
    }
  }
}
