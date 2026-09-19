import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificacaoService } from '../../src/services/notificacaoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
const service = new NotificacaoService()
beforeEach(() => vi.clearAllMocks())

describe('NotificacaoService', () => {
  it('listNotificacoes deve retornar paginado', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    const result = await service.listNotificacoes({ usuarioId: '1' })
    expect(result).toMatchObject({ notificacoes: [], total: 0 })
  })

  it('listNotificacoes deve converter filtro lida string para boolean', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    await service.listNotificacoes({ usuarioId: '1', lida: 'false' })
    const call = vi.mocked(prisma.notificacao.findMany).mock.calls[0][0] as any
    expect(call.where.lida).toBe(false)
  })

  it('createNotificacao deve lançar erro se usuário não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createNotificacao({ usuarioId: 'x' }))
      .rejects.toThrow('Usuário não encontrado')
  })

  it('markAsRead deve lançar erro se não existe', async () => {
    vi.mocked(prisma.notificacao.findUnique).mockResolvedValue(null)
    await expect(service.markAsRead('x', true)).rejects.toThrow('Notificação não encontrada')
  })

  it('deleteNotificacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.notificacao.findUnique).mockResolvedValue(null)
    await expect(service.deleteNotificacao('x')).rejects.toThrow('Notificação não encontrada')
  })

  /*
   * A ordenação precisa ser total.
   *
   * `criadoEm desc` sozinho não é: o estorno dispara duas notificações no mesmo
   * instante, uma para cada lado da fatura. Com `skip`/`take` por cima de uma
   * ordem empatada, duas páginas podem repetir uma linha e pular outra — e a
   * pulada é um aviso que a pessoa nunca vê.
   *
   * Não consegui reproduzir a troca de ordem localmente (tabela pequena, plano
   * estável), então o teste prende o desempate na consulta, não o sintoma.
   */
  it('listNotificacoes ordena com desempate por id', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    await service.listNotificacoes({ usuarioId: '1' })
    const call = vi.mocked(prisma.notificacao.findMany).mock.calls[0][0] as any
    expect(call.orderBy).toEqual([{ criadoEm: 'desc' }, { id: 'desc' }])
  })

  /*
   * `naoLidas` ignora os filtros de propósito: é "quantas te esperam", o
   * número do sino. Contá-lo dentro do filtro faria o badge mudar conforme a
   * tela estivesse filtrada.
   */
  it('listNotificacoes conta naoLidas fora do filtro aplicado', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    await service.listNotificacoes({ usuarioId: '1', tipo: 'NOVO_FEEDBACK', lida: 'true' })
    const [chamadaTotal, chamadaNaoLidas] = vi.mocked(prisma.notificacao.count).mock.calls
    expect((chamadaTotal[0] as any).where).toMatchObject({ tipo: 'NOVO_FEEDBACK', lida: true })
    expect((chamadaNaoLidas[0] as any).where).toEqual({ usuarioId: '1', lida: false })
  })

  describe('facetasDeNotificacoes', () => {
    /*
     * As opções de filtro vinham escritas à mão na tela, copiadas de um enum
     * que o sistema havia parado de falar: quatro dos seis tipos não casavam
     * com nada e só sabiam devolver lista vazia. Vindo do banco, a opção existe
     * porque existe linha.
     */
    it('devolve tipos com rótulo e contagem, só os que a pessoa tem', async () => {
      vi.mocked(prisma.notificacao.groupBy)
        .mockResolvedValueOnce([
          { tipo: 'APROVACAO_SOLICITADA', _count: { _all: 3 } },
          { tipo: 'NOVO_FEEDBACK', _count: { _all: 1 } },
        ] as any)
        .mockResolvedValueOnce([{ canal: 'SISTEMA', _count: { _all: 4 } }] as any)

      const facetas = await service.facetasDeNotificacoes('u1')

      expect(facetas.tipos).toEqual([
        { tipo: 'APROVACAO_SOLICITADA', rotulo: 'Aguardando sua aprovação', total: 3 },
        { tipo: 'NOVO_FEEDBACK', rotulo: 'Novo feedback', total: 1 },
      ])
      expect(facetas.canais).toEqual([{ canal: 'SISTEMA', total: 4 }])
    })

    it('escopa no usuário — faceta não é vitrine do banco inteiro', async () => {
      vi.mocked(prisma.notificacao.groupBy).mockResolvedValue([] as any)
      await service.facetasDeNotificacoes('u1')
      for (const [args] of vi.mocked(prisma.notificacao.groupBy).mock.calls) {
        expect((args as any).where).toEqual({ usuarioId: 'u1' })
      }
    })

    it('linha antiga com tipo fora do vocabulário continua legível', async () => {
      // Produção tem linhas anteriores à correção do enum. Sem rótulo
      // declarado, mostra o próprio valor — some da tela seria pior.
      vi.mocked(prisma.notificacao.groupBy)
        .mockResolvedValueOnce([{ tipo: 'TIPO_APOSENTADO', _count: { _all: 2 } }] as any)
        .mockResolvedValueOnce([] as any)

      const facetas = await service.facetasDeNotificacoes('u1')
      expect(facetas.tipos[0]).toEqual({ tipo: 'TIPO_APOSENTADO', rotulo: 'TIPO_APOSENTADO', total: 2 })
    })
  })

  describe('dispatch', () => {
    it('grava o destino quando o aviso tem para onde levar', async () => {
      vi.mocked(prisma.notificacao.create).mockResolvedValue({} as any)
      service.dispatch('u1', 'APROVACAO_SOLICITADA', 'Titulo', 'Conteudo', {
        entidadeTipo: 'ARTE',
        entidadeId: 'arte1',
      })
      const { data } = vi.mocked(prisma.notificacao.create).mock.calls[0][0] as any
      expect(data).toMatchObject({
        usuarioId: 'u1',
        tipo: 'APROVACAO_SOLICITADA',
        entidadeTipo: 'ARTE',
        entidadeId: 'arte1',
      })
    })

    it('grava destino nulo quando não há para onde ir', async () => {
      vi.mocked(prisma.notificacao.create).mockResolvedValue({} as any)
      service.dispatch('u1', 'SISTEMA', 'Titulo', 'Conteudo')
      const { data } = vi.mocked(prisma.notificacao.create).mock.calls[0][0] as any
      expect(data.entidadeTipo).toBeNull()
      expect(data.entidadeId).toBeNull()
    })

    it('falha de notificação não derruba quem a disparou', async () => {
      // É fire-and-forget de propósito: o cliente foi removido, a fatura foi
      // estornada — o efeito já aconteceu e não pode ser desfeito porque o
      // aviso não saiu.
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(prisma.notificacao.create).mockRejectedValue(new Error('banco fora'))
      expect(() => service.dispatch('u1', 'SISTEMA', 'T', 'C')).not.toThrow()
      await new Promise((r) => setImmediate(r))
      expect(erro).toHaveBeenCalled()
      erro.mockRestore()
    })
  })
})
