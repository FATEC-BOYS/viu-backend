import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsuarioService } from '../../src/services/usuarioService.js'

// Mock prisma
vi.mock('../../src/database/client.js', () => ({
  default: {
    usuario: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sessao: {
      create: vi.fn(),
    },
  },
}))

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn(),
  },
}))

import prisma from '../../src/database/client.js'
import bcrypt from 'bcryptjs'

const service = new UsuarioService()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UsuarioService.listUsuarios', () => {
  it('deve retornar lista paginada de usuários', async () => {
    const mockUsers = [{ id: '1', nome: 'Test' }]
    vi.mocked(prisma.usuario.findMany).mockResolvedValue(mockUsers as any)
    vi.mocked(prisma.usuario.count).mockResolvedValue(1)

    const result = await service.listUsuarios({ page: 1, limit: 10 })
    expect(result).toEqual({ usuarios: mockUsers, total: 1 })
    expect(prisma.usuario.findMany).toHaveBeenCalled()
  })

  it('deve aplicar filtro de tipo', async () => {
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([])
    vi.mocked(prisma.usuario.count).mockResolvedValue(0)

    await service.listUsuarios({ tipo: 'DESIGNER' })
    const call = vi.mocked(prisma.usuario.findMany).mock.calls[0][0] as any
    expect(call.where.tipo).toBe('DESIGNER')
  })

  it('deve converter filtro ativo string para boolean', async () => {
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([])
    vi.mocked(prisma.usuario.count).mockResolvedValue(0)

    await service.listUsuarios({ ativo: 'true' })
    const call = vi.mocked(prisma.usuario.findMany).mock.calls[0][0] as any
    expect(call.where.ativo).toBe(true)
  })
})

describe('UsuarioService.getUsuarioById', () => {
  it('deve retornar usuário por ID', async () => {
    const mockUser = { id: '1', nome: 'Test' }
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(mockUser as any)

    const result = await service.getUsuarioById('1')
    expect(result).toEqual(mockUser)
  })

  it('deve retornar null se não encontrado', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    const result = await service.getUsuarioById('inexistente')
    expect(result).toBeNull()
  })
})

describe('UsuarioService.createUsuario', () => {
  it('deve criar usuário com senha hash', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.create).mockResolvedValue({ id: '1', email: 'a@b.com' } as any)

    await service.createUsuario({ email: 'a@b.com', senha: '123456', nome: 'Test' })
    expect(bcrypt.hash).toHaveBeenCalledWith('123456', 10)
    expect(prisma.usuario.create).toHaveBeenCalled()
  })

  it('deve lançar erro se email já existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createUsuario({ email: 'dup@b.com', senha: '123' }))
      .rejects.toThrow('Email já está em uso')
  })
})

describe('UsuarioService.updateUsuario', () => {
  it('deve atualizar usuário existente', async () => {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: '1', email: 'old@b.com' } as any)
    vi.mocked(prisma.usuario.update).mockResolvedValue({ id: '1', nome: 'Updated' } as any)

    const result = await service.updateUsuario('1', { nome: 'Updated' })
    expect(result.nome).toBe('Updated')
  })

  it('deve lançar erro se usuário não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.updateUsuario('x', { nome: 'A' }))
      .rejects.toThrow('Usuário não encontrado')
  })

  it('deve verificar duplicidade de email ao alterar', async () => {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: '1', email: 'old@b.com' } as any)
      .mockResolvedValueOnce({ id: '2', email: 'new@b.com' } as any)

    await expect(service.updateUsuario('1', { email: 'new@b.com' }))
      .rejects.toThrow('Email já está em uso')
  })

  it('deve fazer hash de nova senha', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce({ id: '1', email: 'a@b.com' } as any)
    vi.mocked(prisma.usuario.update).mockResolvedValue({ id: '1' } as any)

    await service.updateUsuario('1', { senha: 'novaSenha' })
    expect(bcrypt.hash).toHaveBeenCalledWith('novaSenha', 10)
  })
})

describe('UsuarioService.deactivateUsuario', () => {
  it('deve desativar usuário existente', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.update).mockResolvedValue({} as any)

    await service.deactivateUsuario('1')
    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { ativo: false },
    })
  })

  it('deve lançar erro se não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.deactivateUsuario('x')).rejects.toThrow('Usuário não encontrado')
  })
})

describe('UsuarioService.login', () => {
  it('deve retornar token e usuário com credenciais válidas', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: '1', email: 'a@b.com', nome: 'T', tipo: 'DESIGNER', avatar: null,
      ativo: true, senha: 'hashed',
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any)
    vi.mocked(prisma.sessao.create).mockResolvedValue({} as any)

    const result = await service.login({ email: 'a@b.com', senha: '123' })
    expect(result.token).toBeDefined()
    expect(result.usuario.email).toBe('a@b.com')
  })

  it('deve lançar erro com credenciais inválidas', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: '1', ativo: true, senha: 'h',
    } as any)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any)

    await expect(service.login({ email: 'a@b.com', senha: 'wrong' }))
      .rejects.toThrow('Email ou senha inválidos')
  })

  it('deve lançar erro se usuário inativo', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: '1', ativo: false, senha: 'h',
    } as any)

    await expect(service.login({ email: 'a@b.com', senha: '123' }))
      .rejects.toThrow('Email ou senha inválidos ou usuário inativo')
  })

  it('deve lançar erro se usuário não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.login({ email: 'x@b.com', senha: '123' }))
      .rejects.toThrow('Email ou senha inválidos ou usuário inativo')
  })
})

describe('UsuarioService.statsOverview', () => {
  it('deve retornar estatísticas', async () => {
    vi.mocked(prisma.usuario.count)
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(4)  // designers
      .mockResolvedValueOnce(5)  // clientes
      .mockResolvedValueOnce(1)  // admins
      .mockResolvedValueOnce(8)  // ativos

    const result = await service.statsOverview()
    expect(result.total).toBe(10)
    expect(result.porTipo.designers).toBe(4)
    expect(result.ativos).toBe(8)
    expect(result.inativos).toBe(2)
    expect(result.percentualAtivos).toBe(80)
  })
})
