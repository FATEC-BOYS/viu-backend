import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

/**
 * A home do admin em uma requisição.
 *
 * O que estes testes travam: a porta (só ADMIN entra) e o contrato que a tela
 * consome — inclusive `aprovacoesDecididas: null`, que não é lacuna
 * esquecida e sim a única resposta honesta enquanto `Aprovacao` não guarda
 * quando foi decidida.
 */

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, ADMIN, ORIGIN } from '../helpers/token.js'

const db = prisma as any
const SESSION = { id: 'csession000000001' }

const ONTEM = new Date('2026-09-08T12:00:00.000Z')
const ANTEONTEM = new Date('2026-09-07T09:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue(SESSION)
  db.usuario.count.mockResolvedValue(4)
  db.projeto.count.mockResolvedValue(2)
  db.arte.count.mockResolvedValue(7)
  db.linkCompartilhado.count.mockResolvedValue(5)
  db.feedback.count.mockResolvedValue(12)
  db.aprovacao.count.mockResolvedValue(3)
  db.saque.count.mockResolvedValue(2)
  db.disputa.count.mockResolvedValue(1)
  db.$queryRaw
    .mockResolvedValueOnce([{ criados: 18, abertos: 11, com_feedback: 6, com_decisao: 3 }])
    .mockResolvedValueOnce([{ total: 4 }])
  db.saque.findMany.mockResolvedValue([
    { id: 'csaque00000000001', valor: 120000, status: 'SOLICITADO', criadoEm: ONTEM,
      designer: { nome: 'Ana Silva' } },
  ])
  db.disputa.findMany.mockResolvedValue([
    { id: 'cdisputa000000001', status: 'EM_ANALISE', criadoEm: ANTEONTEM,
      projeto: { nome: 'Rebrand FitTracker' } },
  ])
  db.usuario.findMany.mockResolvedValue([
    { id: 'cusuario000000001', nome: 'João Santos', email: 'joao@empresa.com',
      tipo: 'CLIENTE', emailVerificado: false, criadoEm: ONTEM },
  ])
})

describe('GET /admin/resumo', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  async function pedir(usuario: typeof ADMIN) {
    const token = await makeToken(usuario)
    return app.inject({
      method: 'GET',
      url: '/admin/resumo',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })
  }

  it('recusa quem não é admin', async () => {
    const res = await pedir(DESIGNER)
    expect(res.statusCode).toBe(403)
  })

  it('recusa quem não está autenticado', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/resumo', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
  })

  it('devolve os cards do dia', async () => {
    const res = await pedir(ADMIN)
    expect(res.statusCode).toBe(200)

    expect(res.json().data.hoje).toEqual({
      contasNovas: 4,
      projetosCriados: 2,
      artesEnviadas: 7,
      linksGerados: 5,
      feedbacksCriados: 12,
      aprovacoesSolicitadas: 3,
      aprovacoesDecididas: null,
    })
  })

  it('devolve o funil e o que precisa de atenção', async () => {
    const { data } = (await pedir(ADMIN)).json()

    expect(data.funil).toEqual({ janelaDias: 7, criados: 18, abertos: 11, comFeedback: 6, comDecisao: 3 })
    expect(data.precisaDeVoce).toEqual({ saquesPendentes: 2, disputasAbertas: 1, linksTravados: 4 })
  })

  /** O mais velho primeiro: é quem está esperando há mais tempo. */
  it('junta saques e disputas numa fila, do mais antigo para o mais novo', async () => {
    const { data } = (await pedir(ADMIN)).json()

    expect(data.fila.map((i: any) => i.tipo)).toEqual(['DISPUTA', 'SAQUE'])
    // O Intl separa "R$" do número com espaço não-quebrável (U+00A0), não com
    // espaço comum — comparar com espaço literal falha por um caractere que
    // ninguém vê.
    expect(data.fila[1].titulo.replace(/\u00a0/g, ' ')).toBe('Ana Silva — R$ 1.200,00')
    expect(data.fila[0].href).toBe('/disputas')
  })

  /**
   * Estados vêm da máquina de estados, não de uma lista copiada: o efeito de
   * esquecer um estado aqui é uma disputa parada que ninguém vê.
   */
  it('conta disputas pelos estados que ainda esperam alguém', async () => {
    await pedir(ADMIN)

    const [argumentos] = db.disputa.count.mock.calls[0]
    expect(argumentos.where.status.in).toEqual(
      expect.arrayContaining(['ABERTA', 'EM_ANALISE', 'ESCALADA']),
    )
    expect(argumentos.where.status.in).not.toContain('RESOLVIDA_DESIGNER')
  })

  it('devolve os cadastros recentes com o estado de verificação', async () => {
    const { data } = (await pedir(ADMIN)).json()

    expect(data.usuariosRecentes[0]).toMatchObject({
      email: 'joao@empresa.com',
      emailVerificado: false,
    })
    expect(db.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { criadoEm: 'desc' } }),
    )
  })

  it('declara o fuso em que "hoje" foi contado', async () => {
    const { data } = (await pedir(ADMIN)).json()
    expect(data.periodo.fuso).toBe('America/Sao_Paulo')
  })
})
