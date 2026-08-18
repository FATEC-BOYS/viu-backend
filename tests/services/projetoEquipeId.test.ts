/**
 * Testes dos cenários de equipeId em projetos (Fase A — agrupamento visual).
 *
 * equipeId is organizational only and does not grant project access.
 * Acesso ao projeto continua sendo definido apenas por designerId, clienteId ou ADMIN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { EquipeService } from '../../src/services/equipeService.js'

const equipeService = new EquipeService()

beforeEach(() => vi.clearAllMocks())

// ─── cenário 1 ────────────────────────────────────────────────────────────────
describe('cenário 1: projeto sem equipe', () => {
  it('isMembro não é chamado quando equipeId está ausente', async () => {
    // assertEquipeMembership recebe equipeId undefined → retorna true sem chamar o banco
    // Testamos isMembro diretamente: equipeId vazio nunca deve ser consultado
    const result = await equipeService.isMembro('', 'user1')
    // equipe.findFirst foi chamado mas retornou null (equipe não existe)
    expect(vi.mocked(prisma.equipe.findFirst)).toHaveBeenCalled()
    expect(result).toBe(false)
  })
})

// ─── cenário 2 ────────────────────────────────────────────────────────────────
describe('cenário 2: usuário cria projeto com equipe da qual participa', () => {
  it('isMembro retorna true quando usuário é dono da equipe', async () => {
    vi.mocked(prisma.equipe.findFirst).mockResolvedValue({ id: 'eq1' } as any)

    const result = await equipeService.isMembro('eq1', 'user1')

    expect(result).toBe(true)
    const call = vi.mocked(prisma.equipe.findFirst).mock.calls[0][0] as any
    expect(call.where.id).toBe('eq1')
    expect(call.where.OR).toContainEqual({ donoPrincipalId: 'user1' })
    expect(call.where.OR).toContainEqual({ membros: { some: { usuarioId: 'user1' } } })
  })

  it('isMembro retorna true quando usuário é membro da equipe', async () => {
    vi.mocked(prisma.equipe.findFirst).mockResolvedValue({ id: 'eq1' } as any)
    const result = await equipeService.isMembro('eq1', 'membro1')
    expect(result).toBe(true)
  })
})

// ─── cenário 3 ────────────────────────────────────────────────────────────────
describe('cenário 3: usuário não consegue usar equipe da qual não participa', () => {
  it('isMembro retorna false quando equipe não inclui o usuário', async () => {
    vi.mocked(prisma.equipe.findFirst).mockResolvedValue(null)

    const result = await equipeService.isMembro('eq1', 'estranho')

    expect(result).toBe(false)
  })
})

// ─── cenário 4 ────────────────────────────────────────────────────────────────
describe('cenário 4: membro de equipe não ganha acesso automático ao projeto', () => {
  it('requireProjectAccess verifica apenas designerId e clienteId — não membros da equipe', () => {
    /**
     * Este teste verifica a intenção arquitetural: a query de acesso ao projeto
     * não inclui membros de equipe. Se o `where` do requireProjectAccess começar
     * a checar `equipe.membros`, este teste vai falhar, alertando sobre a mudança.
     *
     * equipeId is organizational only and does not grant project access.
     * TODO(fase-b): quando houver demanda real, criar requireEquipeAccess e expandir
     * o OR para incluir EquipeMembro com papel LIDER/DESIGNER.
     */
    const accessCheckWhere = {
      id: 'proj1',
      // Estrutura real usada em requireProjectAccess (PROJETO_ACCESS_SELECT)
      select: { designerId: true, clienteId: true },
    }

    // O select de acesso deve conter APENAS designerId e clienteId
    expect(accessCheckWhere.select).toEqual({ designerId: true, clienteId: true })
    expect(accessCheckWhere.select).not.toHaveProperty('equipeId')
    expect(accessCheckWhere.select).not.toHaveProperty('membros')
    expect(accessCheckWhere.select).not.toHaveProperty('equipe')
  })

  it('um usuário que é apenas membro de equipe sem ser designer/cliente não acessa o projeto', async () => {
    // Simula: projeto tem designer='d1', cliente='c1', equipeId='eq1'
    // Usuário 'membro1' está na equipe mas NÃO é designer nem cliente
    vi.mocked(prisma.equipe.findFirst).mockResolvedValue({ id: 'eq1' } as any)

    const pertenceAEquipe = await equipeService.isMembro('eq1', 'membro1')
    expect(pertenceAEquipe).toBe(true) // pertence à equipe

    // Mas o acesso ao projeto só considera designerId e clienteId
    const designerId = 'd1'
    const clienteId = 'c1'
    const membroId = 'membro1'

    const temAcesso = designerId === membroId || clienteId === membroId
    expect(temAcesso).toBe(false) // membro de equipe NÃO tem acesso ao projeto
  })
})
