import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})
vi.mock('../../src/services/notificacaoService.js', () => ({
  notificacaoService: { dispatch: vi.fn() },
}))

import { prisma } from '../../src/database/client.js'
import { env } from '../../src/config/env.js'
import { FaturaService } from '../../src/services/faturaService.js'

const service = new FaturaService()
const db = prisma as any

const DESIGNER = 'cd0000000000000000000001'
const CLIENTE = 'cc0000000000000000000001'
const PROJETO = 'cp0000000000000000000001'

/**
 * O portão do contrato na criação de fatura.
 *
 * Duas metades. Desligado — o padrão — ele não impede nada e devolve
 * `avisoContrato` junto da fatura, para a tela dizer o que falta. Ligado, ele
 * recusa. A mesma função calcula as duas, porque duas listas separadas
 * divergem, e divergirem aqui significa a tela dizer "pode cobrar" enquanto o
 * backend recusa.
 */

function projetoFaturavel() {
  db.projeto.findUnique.mockResolvedValue({
    id: PROJETO, nome: 'Site', orcamento: 15000, designerId: DESIGNER, clienteId: CLIENTE,
  })
  db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
  db.assinatura.findFirst.mockResolvedValue(null)
  db.fatura.findFirst.mockResolvedValue(null)
  db.fatura.create.mockResolvedValue({
    id: 'cf1', valor: 15000, taxaPlataforma: 1500, valorLiquidoDesigner: 13500,
    dataVencimento: null, dataPagamento: null,
  })
}

/** Contrato vigente com os aceites indicados. */
function contrato(aceitaram: string[]) {
  db.contratoProjeto.findFirst.mockResolvedValue({
    id: 'ccontrato1',
    versao: 1,
    aceites: aceitaram.map((usuarioId) => ({ usuarioId })),
  })
}

function semContrato() {
  db.contratoProjeto.findFirst.mockResolvedValue(null)
}

const flagOriginal = env.EXIGIR_CONTRATO_PROJETO

beforeEach(() => {
  vi.clearAllMocks()
  projetoFaturavel()
})

afterEach(() => {
  ;(env as any).EXIGIR_CONTRATO_PROJETO = flagOriginal
})

describe('com o portão desligado — o padrão', () => {
  beforeEach(() => {
    ;(env as any).EXIGIR_CONTRATO_PROJETO = false
  })

  it('cria a fatura mesmo sem contrato', async () => {
    // Ligar o bloqueio de uma vez, com os projetos existentes sem contrato,
    // deixaria todo mundo sem conseguir cobrar.
    semContrato()
    const f: any = await service.criarFatura(PROJETO, DESIGNER)
    expect(f.id).toBe('cf1')
  })

  it('mas avisa, e diz o que falta', async () => {
    semContrato()
    const f: any = await service.criarFatura(PROJETO, DESIGNER)
    expect(f.avisoContrato.bloqueia).toBe(false)
    expect(f.avisoContrato.mensagem).toMatch(/ainda não tem o resumo do combinado gerado/i)
  })

  it('o aviso nomeia quem falta aceitar, não "alguém"', async () => {
    contrato([DESIGNER])
    const f: any = await service.criarFatura(PROJETO, DESIGNER)
    expect(f.avisoContrato.mensagem).toMatch(/cliente ainda não aceitou/i)
    expect(f.avisoContrato.faltam).toEqual(['CLIENTE'])
  })

  it('sem pendência nenhuma, não há aviso', async () => {
    contrato([DESIGNER, CLIENTE])
    const f: any = await service.criarFatura(PROJETO, DESIGNER)
    expect(f.avisoContrato).toBeNull()
  })
})

describe('com o portão ligado', () => {
  beforeEach(() => {
    ;(env as any).EXIGIR_CONTRATO_PROJETO = true
  })

  it('recusa sem contrato, explicando o motivo', async () => {
    semContrato()
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(/resumo do combinado gerado/i)
    expect(db.fatura.create).not.toHaveBeenCalled()
  })

  it('recusa com contrato que só uma parte aceitou', async () => {
    contrato([DESIGNER])
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(/cliente ainda não aceitou/i)
    expect(db.fatura.create).not.toHaveBeenCalled()
  })

  it('recusa quando ninguém aceitou', async () => {
    contrato([])
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(
      /nem pelo designer nem pelo cliente|designer nem pelo cliente/i,
    )
  })

  it('deixa passar com as duas partes aceitando', async () => {
    contrato([DESIGNER, CLIENTE])
    const f: any = await service.criarFatura(PROJETO, DESIGNER)
    expect(f.id).toBe('cf1')
    expect(f.avisoContrato).toBeNull()
  })

  /*
   * O erro carrega um CÓDIGO, e é por ele que o controller devolve 422.
   *
   * Antes o mapeamento casava `/contrato/` na mensagem, e este teste checava a
   * palavra. Parecia inofensivo até a copy mudar: renomear "contrato" para
   * "resumo do combinado" fez toda fatura barrada pelo portão devolver 500, e
   * a tela deixou de saber que bastava gerar ou aceitar o documento. Texto de
   * interface não pode decidir código HTTP — por isso a asserção passou a ser
   * sobre o código, que não muda quando alguém melhora uma frase.
   */
  it('o erro carrega o código que o controller usa para devolver 422', async () => {
    semContrato()
    const erro: any = await service.criarFatura(PROJETO, DESIGNER).catch((e) => e)
    expect(erro.codigo).toBe('CONTRATO_PENDENTE')
  })

  it('a mensagem explica o que fazer, sem carregar o status nas costas', async () => {
    semContrato()
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(/resumo do combinado/i)
  })
})
