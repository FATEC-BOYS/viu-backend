import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
const service = new AprovacaoService()
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 1 } as any)
})

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

  /**
   * Sem este carimbo a linha vai de PENDENTE a APROVADO sem deixar rastro de
   * quando, e o produto não consegue medir o que promete encurtar: o tempo
   * entre pedir a aprovação e receber a resposta.
   */
  /*
   * O par dos dois testes abaixo, que faltava.
   *
   * `updateAprovacao` já era cobrado pelo carimbo; `createAprovacao` não, e
   * era por lá que a aprovação nascia decidida sem dizer quando. Três lugares
   * leem `decididoEm` — a faixa "esta semana" do dashboard, o resumo do admin
   * e o funil, que mede quanto tempo o cliente levou para responder — e nulo
   * ela não conta em nenhum. Medido na tela: duas aprovações APROVADO no
   * mesmo dia, o feed mostrando as duas e o contador ao lado dizendo 1.
   */
  it('createAprovacao carimba quando a aprovação já nasce decidida', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      id: 'art1', autorId: 'd1', versao: 2,
      projeto: { clienteId: 'c1', designerId: 'd1' },
    } as any)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'a1' } as any)

    await service.createAprovacao({ arteId: 'art1', status: 'APROVADO', aprovadorId: 'c1' })

    const [argumentos] = vi.mocked(prisma.aprovacao.create).mock.calls[0] as [any]
    expect(argumentos.data.decididoEm).toBeInstanceOf(Date)
  })

  /** Pedir aprovação não é decidir: PENDENTE fica sem carimbo. */
  it('createAprovacao não carimba a pendência', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      id: 'art1', autorId: 'd1', versao: 2,
      projeto: { clienteId: 'c1', designerId: 'd1' },
    } as any)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'a1' } as any)

    await service.createAprovacao({ arteId: 'art1', status: 'PENDENTE', aprovadorId: 'c1' })

    const [argumentos] = vi.mocked(prisma.aprovacao.create).mock.calls[0] as [any]
    expect(argumentos.data.decididoEm).toBeNull()
  })

  /*
   * A recusa também é uma decisão. Estava na mesma condição que a aprovação
   * para notificar, e precisa estar na mesma para carimbar.
   */
  it('createAprovacao carimba a recusa também', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      id: 'art1', autorId: 'd1', versao: 2,
      projeto: { clienteId: 'c1', designerId: 'd1' },
    } as any)
    vi.mocked(prisma.aprovacao.create).mockResolvedValue({ id: 'a1' } as any)

    await service.createAprovacao({
      arteId: 'art1', status: 'REJEITADO', aprovadorId: 'c1',
      comentario: 'O contraste do texto está baixo demais.',
    })

    const [argumentos] = vi.mocked(prisma.aprovacao.create).mock.calls[0] as [any]
    expect(argumentos.data.decididoEm).toBeInstanceOf(Date)
  })

  it('updateAprovacao carimba quando a decisão saiu de PENDENTE', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1',
      arte: { projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)

    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

    const [argumentos] = vi.mocked(prisma.aprovacao.update).mock.calls[0] as [any]
    expect(argumentos.data.status).toBe('APROVADO')
    expect(argumentos.data.decididoEm).toBeInstanceOf(Date)
  })

  /** Editar só o comentário não é decidir — e não pode reescrever a data. */
  it('updateAprovacao não carimba quando só muda o comentário', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'APROVADO', aprovadorId: 'c1',
      arte: { projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)

    await service.updateAprovacao('a1', { comentario: 'ajustando o texto' }, 'c1')

    const [argumentos] = vi.mocked(prisma.aprovacao.update).mock.calls[0] as [any]
    expect(argumentos.data).not.toHaveProperty('decididoEm')
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
describe('a decisão do cliente move a arte', () => {
  /*
   * Eram dois registros do mesmo fato sem ligação: o cliente aprovava e a arte
   * ficava onde o designer a tinha deixado. Medido no app — cartão em Projetos
   * dizendo "0 de 1 aprovadas", detalhe da arte dizendo "Aprovada", e o
   * cabeçalho do viewer dizendo "Recusada". Um evento, três respostas.
   */
  it('aprovar leva a arte de EM_ANALISE para APROVADO', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1',
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 1 } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

    const [args] = vi.mocked(prisma.arte.update).mock.calls[0] as [any]
    expect(args).toMatchObject({ where: { id: 'art1', versao: 1, status: 'EM_ANALISE' }, data: { status: 'APROVADO' } })
  })

  it('recusar leva a arte para REJEITADO', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1',
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 1 } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await service.updateAprovacao('a1', { status: 'REJEITADO', comentario: 'O contraste está baixo.' }, 'c1')

    const [args] = vi.mocked(prisma.arte.update).mock.calls[0] as [any]
    expect(args.data.status).toBe('REJEITADO')
  })

  /*
   * `REJEITADO → APROVADO` não existe na máquina: o caminho é mandar uma
   * versão nova, que leva a arte a `EM_ANALISE`. Forçar o pulo apagaria a
   * recusa do histórico — e é dela que uma disputa depende.
   */
  it('não força transição que a máquina não permite', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1',
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'REJEITADO', versao: 1 } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

    expect(vi.mocked(prisma.arte.update)).not.toHaveBeenCalled()
  })

  /* Uma falha no status deve abortar também a gravação da decisão. */
  it('decisão antiga sem versão não aprova a v2', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1', versaoNumero: null,
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 2 } as any)
    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')
    expect(prisma.arte.update).not.toHaveBeenCalled()
  })

  it('propaga erro de sincronização para reverter a transação', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1',
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockRejectedValue(new Error('banco fora'))

    await expect(service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')).rejects.toThrow('banco fora')
  })

  /*
   * `Arte.versao` é ponteiro para a entrega atual, e `criarVersao` o avança.
   * O cliente pode ter pendência aberta na v1 quando o designer já subiu a v2:
   * respondida tarde, aquela decisão é sobre a v1, e carimbá-la na arte diria
   * sobre a v2 algo que ninguém falou dela.
   */
  it('decisão de versão antiga não mexe no rótulo da versão atual', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1', versaoNumero: 1,
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    // a arte já está na v2
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 2 } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

    expect(vi.mocked(prisma.arte.update)).not.toHaveBeenCalled()
  })

  it('mas a decisão da versão corrente move normalmente', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', arteId: 'art1', versaoNumero: 2,
      arte: { autorId: 'd1', nome: 'Capa', projeto: { clienteId: 'c1' } },
    } as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ status: 'EM_ANALISE', versao: 2 } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

    const [args] = vi.mocked(prisma.arte.update).mock.calls[0] as [any]
    expect(args.data.status).toBe('APROVADO')
  })
})

describe('pedir aprovação de uma versão já decidida', () => {
  const arteComCliente = {
    id: 'art1', autorId: 'd1', versao: 1,
    projeto: { clienteId: 'c1', designerId: 'd1' },
  }

  /*
   * O 500 que a designer via em produção. A busca que evitava duplicata
   * filtrava `status: 'PENDENTE'`, mas a restrição do banco é
   * `@@unique([arteId, aprovadorId, versaoNumero])` — sem status. Com a versão
   * já decidida, a busca não achava e o `create` batia na restrição.
   * Reproduzido no app: pedir, aprovar, pedir de novo → 500.
   */
  it('avisa em vez de estourar, e não tenta criar outra', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(arteComCliente as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue({
      id: 'a1', status: 'APROVADO', versaoNumero: 1, decididoEm: new Date('2026-10-03T12:00:00Z'),
    } as any)

    await expect(service.solicitarAprovacao('art1', 'd1')).rejects.toThrow(/já foi aprovada/i)
    expect(vi.mocked(prisma.aprovacao.create)).not.toHaveBeenCalled()
  })

  it('a mensagem diz o que fazer: mandar outra versão', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(arteComCliente as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue({
      id: 'a1', status: 'REJEITADO', versaoNumero: 1, decididoEm: null,
    } as any)

    await expect(service.solicitarAprovacao('art1', 'd1')).rejects.toThrow(/nova versão/i)
  })

  /* O que a busca sempre existiu para fazer continua valendo. */
  it('dois cliques em Solicitar devolvem a mesma pendência', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(arteComCliente as any)
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue({
      id: 'a1', status: 'PENDENTE', versaoNumero: 1,
    } as any)

    const r: any = await service.solicitarAprovacao('art1', 'd1')
    expect(r.id).toBe('a1')
    expect(vi.mocked(prisma.aprovacao.create)).not.toHaveBeenCalled()
  })
})

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
    /*
     * O `status` passou a fazer falta no mock porque o serviço passou a lê-lo
     * da linha, em vez de deixá-lo na cláusula da consulta — que é o que fazia
     * a busca não enxergar uma aprovação já decidida e o `create` seguinte
     * estourar na restrição única. O mock não simula o `where`, então a linha
     * precisa dizer o que é.
     */
    vi.mocked(prisma.aprovacao.findFirst).mockResolvedValue({ id: 'ja-existe', status: 'PENDENTE' } as any)

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
  /**
   * Recusar em silêncio devolve ao designer o que ele já tinha: nada para
   * fazer. A regra é do serviço porque `PUT /aprovacoes/:id` é alcançável sem
   * passar pelo formulário.
   */
  describe('a recusa precisa dizer o que mudar', () => {
    const PENDENTE = {
      id: 'a1', status: 'PENDENTE', aprovadorId: 'c1', comentario: null,
      arte: { projeto: { clienteId: 'c1' } },
    }

    it('updateAprovacao recusa REJEITADO sem motivo', async () => {
      vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(PENDENTE as any)

      await expect(
        service.updateAprovacao('a1', { status: 'REJEITADO' }, 'c1'),
      ).rejects.toMatchObject({ codigo: 'RECUSA_SEM_MOTIVO' })

      expect(prisma.aprovacao.update).not.toHaveBeenCalled()
    })

    it('updateAprovacao trata comentário só de espaços como ausente', async () => {
      vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(PENDENTE as any)

      await expect(
        service.updateAprovacao('a1', { status: 'REJEITADO', comentario: '   ' }, 'c1'),
      ).rejects.toMatchObject({ codigo: 'RECUSA_SEM_MOTIVO' })
    })

    it('updateAprovacao aceita a recusa quando vem com motivo', async () => {
      vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(PENDENTE as any)
      vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)

      await service.updateAprovacao('a1', { status: 'REJEITADO', comentario: 'o logo está esticado' }, 'c1')

      const [argumentos] = vi.mocked(prisma.aprovacao.update).mock.calls[0] as [any]
      expect(argumentos.data.status).toBe('REJEITADO')
      expect(argumentos.data.comentario).toBe('o logo está esticado')
    })

    it('updateAprovacao aproveita o motivo já escrito antes da decisão', async () => {
      vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue({
        ...PENDENTE, comentario: 'faltou o contraste do texto',
      } as any)
      vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)

      await service.updateAprovacao('a1', { status: 'REJEITADO' }, 'c1')

      expect(prisma.aprovacao.update).toHaveBeenCalled()
    })

    it('aprovar continua sem exigir comentário — quem gostou não deve nada', async () => {
      vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(PENDENTE as any)
      vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'a1' } as any)

      await service.updateAprovacao('a1', { status: 'APROVADO' }, 'c1')

      expect(prisma.aprovacao.update).toHaveBeenCalled()
    })

    it('createAprovacao aplica a mesma regra', async () => {
      vi.mocked(prisma.arte.findUnique).mockResolvedValue({
        id: '1', autorId: 'd1', versao: 2, projeto: { clienteId: 'c1', designerId: 'd1' },
      } as any)

      await expect(
        service.createAprovacao({ arteId: '1', status: 'REJEITADO', aprovadorId: 'c1' }),
      ).rejects.toMatchObject({ codigo: 'RECUSA_SEM_MOTIVO' })

      expect(prisma.aprovacao.create).not.toHaveBeenCalled()
    })
  })
})
