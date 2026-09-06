import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
const service = new AprovacaoService()
beforeEach(() => vi.clearAllMocks())

describe('AprovacaoService', () => {
  it('listAprovacoes deve retornar paginado', async () => {
    vi.mocked(prisma.aprovacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.aprovacao.count).mockResolvedValue(0)
    const result = await service.listAprovacoes({})
    expect(result).toEqual({ aprovacoes: [], total: 0 })
  })

  it('createAprovacao deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createAprovacao({ arteId: 'x', aprovadorId: '1' }))
      .rejects.toThrow('Arte não encontrada')
  })

  it('createAprovacao deve recusar quem não é o cliente do projeto', async () => {
    // A regra deixou de ser "o aprovador existe": só o cliente do projeto pode
    // aprovar, e o autor nunca aprova a própria arte.
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      id: '1', autorId: 'd1', projeto: { clienteId: 'c1', designerId: 'd1' },
    } as any)
    await expect(service.createAprovacao({ arteId: '1', aprovadorId: 'estranho' }))
      .rejects.toThrow('Apenas o cliente do projeto pode aprovar ou rejeitar artes')
  })

  it('updateAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.updateAprovacao('x', {})).rejects.toThrow('Aprovação não encontrada')
  })

  it('deleteAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.deleteAprovacao('x')).rejects.toThrow('Aprovação não encontrada')
  })
})

/**
 * O gatilho que faltava: nada no produto criava Aprovacao.
 *
 * `POST /aprovacoes` não serve aqui — o controller força
 * `aprovadorId = usuario.id` e a rota exige APROVAR_ARTE, permissão que o
 * designer não tem. Aquela rota é "o cliente registra a própria decisão".
 * Solicitar é o sentido oposto: o designer cria a pendência para o cliente.
 */
describe('solicitarAprovacao', () => {
  const ARTE = {
    id: 'a1',
    nome: 'Capa',
    versao: 3,
    autorId: 'd1',
    projeto: { clienteId: 'c1', designerId: 'd1' },
  }

  it('cria a pendência no nome do cliente, não de quem pediu', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'ap1' } as any)

    await service.solicitarAprovacao('a1', 'd1')

    expect(prisma.aprovacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          arteId: 'a1',
          aprovadorId: 'c1',
          status: 'PENDENTE',
        }),
      }),
    )
  })

  it('grava a versão corrente da arte quando nenhuma é informada', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'ap1' } as any)

    await service.solicitarAprovacao('a1', 'd1')

    const [{ data }] = vi.mocked(prisma.aprovacao.create).mock.calls[0] as any[]
    expect(data.versaoNumero).toBe(3)
  })

  it('recusa quem não é o designer do projeto', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)

    await expect(service.solicitarAprovacao('a1', 'estranho')).rejects.toThrow('Acesso negado')
    expect(prisma.aprovacao.create).not.toHaveBeenCalled()
  })

  it('recusa arte inexistente', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    await expect(service.solicitarAprovacao('x', 'd1')).rejects.toThrow('Arte não encontrada')
  })

  /**
   * Sem isto, dois cliques em "Solicitar" criam duas linhas para a mesma
   * arte+cliente+versão. A rota de decisão busca com `limit=1` e pega `[0]`:
   * a decisão do cliente cairia numa arbitrária e a outra ficaria PENDENTE
   * para sempre.
   */
  it('devolve a pendência existente em vez de duplicar', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue({ id: 'ja-existe' } as any)

    const resultado = await service.solicitarAprovacao('a1', 'd1')

    expect(resultado).toMatchObject({ id: 'ja-existe' })
    expect(prisma.aprovacao.create).not.toHaveBeenCalled()
  })

  it('avisa o cliente de que há algo esperando por ele', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'ap1' } as any)

    await service.solicitarAprovacao('a1', 'd1')

    expect(prisma.notificacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ usuarioId: 'c1' }) }),
    )
  })
})
