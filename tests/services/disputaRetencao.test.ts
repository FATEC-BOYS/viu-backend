import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { DisputaService } from '../../src/services/disputaService.js'
import { notificacaoService } from '../../src/services/notificacaoService.js'

const service = new DisputaService()

let dispatch: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})
  vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
    id: 'proj1',
    nome: 'Rebranding Acme',
    designerId: 'designer1',
    clienteId: 'cliente1',
  } as any)
  // Sem outra disputa em aberto, salvo quando o teste disser o contrário.
  vi.mocked(prisma.disputa.findFirst).mockResolvedValue(null as any)
  vi.mocked(prisma.disputa.create).mockImplementation(async ({ data }: any) => ({
    id: 'disp1',
    ...data,
    projeto: { id: 'proj1', nome: 'Rebranding Acme' },
  }))
})

function fatura(extra: Record<string, unknown> = {}) {
  return {
    id: 'fat1',
    projetoId: 'proj1',
    status: 'PAGA',
    valor: 1200000,
    valorLiquidoDesigner: 1080000,
    designerId: 'designer1',
    clienteId: 'cliente1',
    projeto: { nome: 'Rebranding Acme' },
    ...extra,
  }
}

const abertura = {
  tipo: 'CALOTE' as const,
  descricao: 'O cliente sumiu depois da entrega final e não pagou a fatura.',
  abertaPorId: 'designer1',
  projetoId: 'proj1',
}

/*
 * O mecanismo de retenção existia inteiro e a interface não o alcançava.
 *
 * Conferido no app antes do conserto: fatura PAGA de R$ 10.800, disputa de
 * CALOTE aberta do jeito que a tela abria (sem `faturaId`), `saldoBloqueado: 0`
 * e o saldo do designer intacto. A subtração em `getSaldoDisponivel`, a
 * checagem de `solicitarSaque`, o bloco "Bloqueado em disputa" e o estorno da
 * resolução eram todos código morto pela interface do produto.
 */
describe('Disputa retém o valor da fatura escolhida', () => {
  it('congela o líquido do designer quando a fatura escolhida está paga', async () => {
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura() as any)

    await service.abrirDisputa({ ...abertura, faturaId: 'fat1' })

    const criada = vi.mocked(prisma.disputa.create).mock.calls[0][0] as any
    expect(criada.data.saldoBloqueado).toBe(1080000)
    expect(criada.data.faturaId).toBe('fat1')
  })

  it('não congela nada quando a disputa não aponta fatura nenhuma', async () => {
    await service.abrirDisputa(abertura)

    const criada = vi.mocked(prisma.disputa.create).mock.calls[0][0] as any
    expect(criada.data.saldoBloqueado).toBe(0)
    // Sem fatura não há o que buscar: nem chega a consultar.
    expect(prisma.fatura.findUnique).not.toHaveBeenCalled()
  })

  /*
   * O saldo é `Σ líquido das faturas PAGAS − saques − Σ retido`. Reter o
   * líquido de uma PENDENTE subtrairia um valor que nunca entrou na soma — e
   * CALOTE é justamente a disputa sobre fatura não paga, então este seria o
   * caso mais comum, não o raro.
   */
  it('abre a disputa sem reter quando a fatura escolhida não foi paga', async () => {
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura({ status: 'PENDENTE' }) as any)

    await service.abrirDisputa({ ...abertura, faturaId: 'fat1' })

    const criada = vi.mocked(prisma.disputa.create).mock.calls[0][0] as any
    expect(criada.data.saldoBloqueado).toBe(0)
    // A disputa vale do mesmo jeito: o que não existe é o dinheiro a reter.
    expect(criada.data.faturaId).toBe('fat1')
  })

  it('recusa uma segunda disputa em aberto sobre a mesma fatura', async () => {
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura() as any)
    vi.mocked(prisma.disputa.findFirst).mockResolvedValue({ id: 'disp0' } as any)

    await expect(service.abrirDisputa({ ...abertura, faturaId: 'fat1' })).rejects.toThrow(
      /Já existe uma disputa em aberto/,
    )
    expect(prisma.disputa.create).not.toHaveBeenCalled()
  })

  it('recusa fatura de outro projeto', async () => {
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura({ projetoId: 'proj2' }) as any)

    await expect(service.abrirDisputa({ ...abertura, faturaId: 'fat1' })).rejects.toThrow(
      /não pertence ao projeto/,
    )
    expect(prisma.disputa.create).not.toHaveBeenCalled()
  })
})

/*
 * Abrir disputa não avisava ninguém: nem o outro lado, cujo dinheiro passa a
 * ficar retido, nem o admin — a quem a tela promete "nossa equipe entrará em
 * contato em até 48h".
 */
describe('Abrir disputa avisa quem precisa saber', () => {
  it('avisa o outro lado do projeto, com o valor retido na frase', async () => {
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura() as any)
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([] as any)

    await service.abrirDisputa({ ...abertura, faturaId: 'fat1' })

    const [destinatario, tipo, , conteudo, alvo] = dispatch.mock.calls[0] as any[]
    // Quem abriu foi o designer, então quem é avisado é o cliente.
    expect(destinatario).toBe('cliente1')
    expect(tipo).toBe('DISPUTA_ABERTA')
    expect(conteudo).toContain('Rebranding Acme')
    // O único aviso que o designer recebe antes de tentar sacar e não conseguir.
    expect(conteudo).toContain('10.800,00')
    expect(conteudo).toContain('calote')
    expect(alvo).toEqual({ entidadeTipo: 'DISPUTA', entidadeId: 'disp1' })
  })

  it('avisa o designer quando quem abre é o cliente', async () => {
    await service.abrirDisputa({ ...abertura, abertaPorId: 'cliente1' })

    expect(dispatch.mock.calls[0][0]).toBe('designer1')
  })

  it('diz que nada está retido quando não há fatura em jogo', async () => {
    await service.abrirDisputa(abertura)

    expect(dispatch.mock.calls[0][3]).toContain('Nenhum valor está retido')
  })

  it('avisa cada admin ativo', async () => {
    vi.mocked(prisma.usuario.findMany).mockResolvedValue([{ id: 'admin1' }, { id: 'admin2' }] as any)

    await service.abrirDisputa(abertura)
    // O aviso dos admins não está no caminho da resposta — espera o microtask.
    await new Promise((r) => setImmediate(r))

    const filtro = vi.mocked(prisma.usuario.findMany).mock.calls[0][0] as any
    expect(filtro.where).toEqual({ tipo: 'ADMIN', ativo: true })
    const destinatarios = dispatch.mock.calls.map((c) => c[0])
    expect(destinatarios).toContain('admin1')
    expect(destinatarios).toContain('admin2')
  })

  /*
   * A disputa já está gravada quando o aviso sai. Deixar o erro subir trocaria
   * uma notificação perdida por um 500 numa operação que deu certo.
   */
  it('não derruba a abertura quando avisar os admins falha', async () => {
    vi.mocked(prisma.usuario.findMany).mockRejectedValue(new Error('banco fora'))
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    const disputa = await service.abrirDisputa(abertura)
    await new Promise((r) => setImmediate(r))

    expect(disputa.id).toBe('disp1')
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })
})

/*
 * Resolver move saldo — libera a retenção ou estorna a fatura — e também não
 * avisava ninguém. Quem tinha valor retido só descobriria voltando na tela de
 * saques; quem recebeu o estorno, olhando o extrato do banco.
 */
describe('Resolver disputa conta o desfecho aos dois lados', () => {
  function disputaAberta(extra: Record<string, unknown> = {}) {
    return {
      id: 'disp1',
      status: 'ABERTA',
      saldoBloqueado: 1080000,
      faturaId: null,
      projeto: { nome: 'Rebranding Acme', designerId: 'designer1', clienteId: 'cliente1' },
      ...extra,
    }
  }

  beforeEach(() => {
    vi.mocked(prisma.disputa.update).mockResolvedValue({ id: 'disp1' } as any)
  })

  it('avisa designer e cliente que o valor foi liberado', async () => {
    vi.mocked(prisma.disputa.findUnique).mockResolvedValue(disputaAberta() as any)

    await service.resolverDisputa('disp1', {
      status: 'RESOLVIDA_DESIGNER',
      resolucao: 'Entrega comprovada.',
    })

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual(['designer1', 'cliente1'])
    expect(dispatch.mock.calls[0][1]).toBe('DISPUTA_RESOLVIDA')
    expect(dispatch.mock.calls[0][3]).toContain('10.800,00')
    expect(dispatch.mock.calls[0][3]).toContain('disponíveis para saque')
  })

  /*
   * Escalar não é encerrar: a disputa continua de pé e o dinheiro continua
   * preso. Dizer "encerrada" aqui seria mentir sobre o saldo.
   */
  it('não diz que encerrou quando a disputa só foi escalada', async () => {
    vi.mocked(prisma.disputa.findUnique).mockResolvedValue(disputaAberta() as any)

    await service.resolverDisputa('disp1', { status: 'ESCALADA', resolucao: 'Subiu para o jurídico.' })

    const conteudo = dispatch.mock.calls[0][3] as string
    expect(conteudo).toContain('continua em aberto')
    expect(conteudo).toContain('seguem retidos')
    expect(conteudo).not.toContain('encerrada')
  })

  it('diz que a devolução precisa ser feita por fora quando o estorno não passou pelo gateway', async () => {
    vi.mocked(prisma.disputa.findUnique).mockResolvedValue(
      disputaAberta({ faturaId: 'fat1' }) as any,
    )
    // Sem `mpPaymentId`: a fatura nunca passou pelo Mercado Pago, que é o
    // caso em que o dinheiro não se move sozinho.
    vi.mocked(prisma.fatura.findUnique).mockResolvedValue(fatura({ pagamentos: [] }) as any)
    vi.mocked(prisma.fatura.updateMany).mockResolvedValue({ count: 1 } as any)

    await service.resolverDisputa('disp1', {
      status: 'RESOLVIDA_CLIENTE',
      resolucao: 'Entrega não comprovada.',
    })

    /*
     * O estorno dispara os avisos dele antes; o que interessa aqui é o da
     * disputa. Procurar pelo tipo evita um teste que passa por posição.
     */
    const doDesfecho = dispatch.mock.calls.filter((c) => c[1] === 'DISPUTA_RESOLVIDA')
    expect(doDesfecho).toHaveLength(2)
    expect(doDesfecho[0][3]).toContain('por fora')
  })
})
