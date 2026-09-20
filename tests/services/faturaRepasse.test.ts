import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { FaturaService } from '../../src/services/faturaService.js'

const db = prisma as any
const service = new FaturaService()

const CLIENTE = 'ccliente0000000001'
const DESIGNER = 'cdesigner000000001'

const FATURA = {
  id: 'cfatura00000000001',
  clienteId: CLIENTE,
  designerId: DESIGNER,
  valor: 1200000,
  taxaPlataforma: 120000,
  valorLiquidoDesigner: 1080000,
  status: 'PENDENTE',
  descricao: null,
  dataVencimento: new Date('2026-09-15T00:00:00.000Z'),
  dataPagamento: null,
  projeto: { id: 'cprojeto000000001', nome: 'App Mobile' },
  cliente: { id: CLIENTE, nome: 'João Santos' },
  designer: { id: DESIGNER, nome: 'Ana Silva' },
  pagamentos: [],
}

/*
 * `Intl.NumberFormat('pt-BR')` separa o símbolo com espaço não-quebrável
 * (U+00A0), não com espaço comum. Comparar direto faz o teste falhar exibindo
 * duas strings idênticas na tela.
 */
function moeda(v: string) {
  return v.replace(/\u00A0/g, ' ')
}

const CAMPOS_DO_REPASSE = [
  'taxaPlataforma',
  'taxaPlataformaFormatada',
  'valorLiquidoDesigner',
  'valorLiquidoDesignerFormatado',
]

beforeEach(() => vi.clearAllMocks())

/*
 * A fatura do cliente trazia a quebra: quem pagava R$ 12.000 lia "Taxa
 * plataforma R$ 1.200" e "Designer recebe R$ 10.800" — a margem do VIU e a do
 * designer, de graça, na tela de quem pode propor pagar por fora.
 *
 * O corte é no servidor de propósito. Escondido só no componente, o número
 * continuaria no corpo da resposta, a um devtools de distância.
 */
describe('O repasse só vai para quem ele diz respeito', () => {
  it('o cliente não recebe taxa nem líquido do designer', async () => {
    db.fatura.findUnique.mockResolvedValue(FATURA)

    const fatura: any = await service.getFaturaById(FATURA.id, CLIENTE, false)

    for (const campo of CAMPOS_DO_REPASSE) {
      expect(fatura, `vazou ${campo}`).not.toHaveProperty(campo)
    }
    // O que ele paga continua lá — é o que a tela dele precisa.
    expect(moeda(fatura.valorFormatado)).toBe('R$ 12.000,00')
  })

  it('o designer recebe a quebra inteira', async () => {
    db.fatura.findUnique.mockResolvedValue(FATURA)

    const fatura: any = await service.getFaturaById(FATURA.id, DESIGNER, false)

    expect(moeda(fatura.taxaPlataformaFormatada)).toBe('R$ 1.200,00')
    expect(moeda(fatura.valorLiquidoDesignerFormatado)).toBe('R$ 10.800,00')
  })

  it('o admin também — é quem coordena a plataforma', async () => {
    db.fatura.findUnique.mockResolvedValue(FATURA)

    const fatura: any = await service.getFaturaById(FATURA.id, 'cadmin00000000001', true)

    expect(moeda(fatura.valorLiquidoDesignerFormatado)).toBe('R$ 10.800,00')
  })

  it('a listagem do cliente também não leva o repasse', async () => {
    db.fatura.findMany.mockResolvedValue([FATURA])

    const [fatura] = (await service.listarFaturas(CLIENTE, 'cliente')) as any[]

    for (const campo of CAMPOS_DO_REPASSE) {
      expect(fatura, `vazou ${campo}`).not.toHaveProperty(campo)
    }
  })

  it('a listagem do designer leva', async () => {
    db.fatura.findMany.mockResolvedValue([FATURA])

    const [fatura] = (await service.listarFaturas(DESIGNER, 'designer')) as any[]

    expect(moeda(fatura.valorLiquidoDesignerFormatado)).toBe('R$ 10.800,00')
  })
})

/*
 * "Vence 15 de set." em cinza, cinco dias depois do vencimento, numa tela
 * chamada "o que você tem a pagar". O atraso é o dado mais acionável da tela e
 * não aparecia. Sai do servidor porque é ele que tem a data e o relógio.
 */
describe('Fatura vencida', () => {
  it('marca vencida quando o prazo passou e ninguém pagou', async () => {
    db.fatura.findUnique.mockResolvedValue(FATURA)
    const fatura: any = await service.getFaturaById(FATURA.id, CLIENTE, false)
    expect(fatura.vencida).toBe(true)
  })

  it('não marca quando ainda há prazo', async () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
    db.fatura.findUnique.mockResolvedValue({ ...FATURA, dataVencimento: amanha })
    const fatura: any = await service.getFaturaById(FATURA.id, CLIENTE, false)
    expect(fatura.vencida).toBe(false)
  })

  it('não marca fatura já paga, mesmo com o prazo vencido', async () => {
    // Pagou atrasado é pagou. Cobrar de novo seria mentir sobre o que falta.
    db.fatura.findUnique.mockResolvedValue({ ...FATURA, status: 'PAGA' })
    const fatura: any = await service.getFaturaById(FATURA.id, CLIENTE, false)
    expect(fatura.vencida).toBe(false)
  })

  it('não marca fatura sem data de vencimento', async () => {
    db.fatura.findUnique.mockResolvedValue({ ...FATURA, dataVencimento: null })
    const fatura: any = await service.getFaturaById(FATURA.id, CLIENTE, false)
    expect(fatura.vencida).toBe(false)
  })
})
