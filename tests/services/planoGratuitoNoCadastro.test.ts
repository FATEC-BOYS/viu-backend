import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
vi.mock('../../src/services/mercadoPagoService.js', () => ({ mpPreApproval: { create: vi.fn() } }))
vi.mock('../../src/services/notificacaoService.js', () => ({ notificacaoService: {} }))

import prisma from '../../src/database/client.js'
import { AssinaturaService } from '../../src/services/assinaturaService.js'

const service = new AssinaturaService()
beforeEach(() => vi.clearAllMocks())

const GRATUITO = { id: 'p-gratuito', nome: 'Gratuito', tipo: 'DESIGNER', precoMensal: 0, taxaPlataforma: 0.1 }

/**
 * O designer nasce no plano gratuito.
 *
 * O produto já tratava a ausência de assinatura como "está no gratuito" na
 * hora de calcular a taxa da fatura — mas a tela não sabia, e o Perfil dizia
 * "Nenhuma assinatura ativa" para todo designer do VIU. O que estes testes
 * protegem não é a criação da linha, é o que NÃO pode acontecer por causa
 * dela: um cadastro recusado.
 */
describe('AssinaturaService.assinarPlanoGratuito', () => {
  it('assina o gratuito do designer', async () => {
    vi.mocked(prisma.plano.findFirst).mockResolvedValue(GRATUITO as any)
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.assinatura.create).mockResolvedValue({ id: 'a1' } as any)

    await service.assinarPlanoGratuito('u1')

    const dados = vi.mocked(prisma.assinatura.create).mock.calls[0][0] as any
    expect(dados.data).toMatchObject({ usuarioId: 'u1', planoId: 'p-gratuito', status: 'ATIVA' })
    expect(dados.data.periodoInicio).toBeInstanceOf(Date)
  })

  it('escolhe o gratuito pela mesma regra que a taxa da fatura usa', async () => {
    // Taxa saindo de um plano e limites de outro é o defeito que a função
    // única existe para impedir. A ordem explícita também importa: sem ela o
    // Postgres pode devolver outra linha a cada consulta.
    vi.mocked(prisma.plano.findFirst).mockResolvedValue(GRATUITO as any)
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(null)

    await service.assinarPlanoGratuito('u1')

    const busca = vi.mocked(prisma.plano.findFirst).mock.calls[0][0] as any
    expect(busca.where).toEqual({ tipo: 'DESIGNER', ativo: true, precoMensal: 0 })
    expect(busca.orderBy).toEqual({ criadoEm: 'asc' })
  })

  it('não estoura quando não há plano gratuito cadastrado', async () => {
    // Banco sem planos não pode recusar cadastro: seria trocar um incômodo
    // por uma porta fechada, e a taxa da fatura já tem saída própria.
    vi.mocked(prisma.plano.findFirst).mockResolvedValue(null)

    await expect(service.assinarPlanoGratuito('u1')).resolves.toBeNull()
    expect(prisma.assinatura.create).not.toHaveBeenCalled()
  })

  it('não cria uma segunda assinatura para quem já assina', async () => {
    vi.mocked(prisma.plano.findFirst).mockResolvedValue(GRATUITO as any)
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({ id: 'ja-tem' } as any)

    await expect(service.assinarPlanoGratuito('u1')).resolves.toBeNull()
    expect(prisma.assinatura.create).not.toHaveBeenCalled()
  })
})
