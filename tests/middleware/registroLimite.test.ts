import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O cadastro tinha duas portas para o mesmo handler — `/auth/register` e
 * `POST /usuarios` — cada uma com seu balde de rate limit. Alternar entre elas
 * dobrava o teto de contas por IP, e a porta de `/usuarios` ainda aceitava
 * `tipo: 'DESIGNER'` sem sessão nenhuma.
 *
 * Estes testes travam as duas metades da correção: o limite do cadastro
 * público (hora em memória, dia no banco) e o fechamento da porta lateral.
 */

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

// `vi.hoisted` porque a fábrica do vi.mock sobe para o topo do arquivo: uma
// const comum ainda não existiria quando ela roda.
const envFalso = vi.hoisted(() => ({
  REGISTRO_MAX_HORA: 2,
  REGISTRO_MAX_DIA: 3,
  CLIENTES_MAX_HORA: 2,
}))
vi.mock('../../src/config/env.js', () => ({ env: envFalso }))

import prisma from '../../src/database/client.js'
import {
  limitarRegistroPublico,
  limitarCriacaoDeCliente,
  limparHistoricoDeRegistro,
} from '../../src/middleware/registroLimiteMiddleware.js'
import { restringirCriacaoACliente } from '../../src/middleware/usuarioMiddleware.js'

function pedido(extras: Record<string, unknown> = {}) {
  return {
    ip: '203.0.113.10',
    log: { warn: vi.fn(), error: vi.fn() },
    ...extras,
  } as any
}

function resposta() {
  const reply: any = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
    header(nome: string, valor: string) { reply.headers[nome] = valor; return reply },
    status(code: number) { reply.statusCode = code; return reply },
    send(data: any) { reply.body = data; return reply },
  }
  return reply
}

beforeEach(() => {
  vi.clearAllMocks()
  limparHistoricoDeRegistro()
  envFalso.REGISTRO_MAX_HORA = 2
  envFalso.REGISTRO_MAX_DIA = 3
  envFalso.CLIENTES_MAX_HORA = 2
  vi.mocked(prisma.auditLog.count).mockResolvedValue(0)
})

describe('cadastro público: limite por hora', () => {
  it('deixa passar até o teto e recusa a partir dele', async () => {
    for (let i = 0; i < 2; i++) {
      const reply = resposta()
      await limitarRegistroPublico(pedido(), reply)
      expect(reply.statusCode).toBe(200)
    }

    const reply = resposta()
    await limitarRegistroPublico(pedido(), reply)
    expect(reply.statusCode).toBe(429)
    expect(reply.body.message).toMatch(/muitas tentativas/i)
    expect(reply.headers['retry-after']).toBe('3600')
  })

  it('conta por IP — quem está atrás de outro endereço não paga pelo vizinho', async () => {
    for (let i = 0; i < 3; i++) {
      await limitarRegistroPublico(pedido(), resposta())
    }

    const reply = resposta()
    await limitarRegistroPublico(pedido({ ip: '198.51.100.7' }), reply)
    expect(reply.statusCode).toBe(200)
  })
})

describe('cadastro público: teto diário', () => {
  /**
   * Só conta REGISTER com SUCCESS. Se contasse tentativa, as próprias
   * respostas 429 — que também viram linha de auditoria — realimentariam o
   * contador e o bloqueio nunca terminaria.
   */
  it('conta apenas contas efetivamente criadas por este IP nas últimas 24h', async () => {
    await limitarRegistroPublico(pedido(), resposta())

    expect(prisma.auditLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'REGISTER',
          status: 'SUCCESS',
          ipAddress: '203.0.113.10',
        }),
      }),
    )
  })

  it('recusa quando o dia já bateu o teto, mesmo dentro do limite da hora', async () => {
    vi.mocked(prisma.auditLog.count).mockResolvedValue(3)

    const reply = resposta()
    await limitarRegistroPublico(pedido(), reply)

    expect(reply.statusCode).toBe(429)
    expect(reply.body.message).toMatch(/amanhã/i)
    expect(reply.headers['retry-after']).toBe('86400')
  })

  /** Banco fora do ar não pode virar cadastro trancado para todo mundo. */
  it('segue quando a consulta de auditoria falha, e registra no log', async () => {
    vi.mocked(prisma.auditLog.count).mockRejectedValue(new Error('sem conexão'))

    const req = pedido()
    const reply = resposta()
    await limitarRegistroPublico(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.log.warn).toHaveBeenCalled()
  })
})

describe('cadastro de cliente pelo designer', () => {
  it('recusa quem tenta criar DESIGNER por essa rota', async () => {
    const reply = resposta()
    await restringirCriacaoACliente(pedido({ body: { tipo: 'DESIGNER' } }), reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body.message).toMatch(/só é possível cadastrar clientes/i)
  })

  it('deixa passar CLIENTE', async () => {
    const reply = resposta()
    await restringirCriacaoACliente(pedido({ body: { tipo: 'CLIENTE' } }), reply)
    expect(reply.statusCode).toBe(200)
  })

  /**
   * A chave é o usuário, não o IP: um estúdio inteiro atrás do mesmo endereço
   * de saída não pode dividir a mesma cota.
   */
  it('limita por usuário autenticado, não por IP', async () => {
    const mesmoIp = { ip: '203.0.113.10' }

    for (let i = 0; i < 2; i++) {
      const reply = resposta()
      await limitarCriacaoDeCliente(pedido({ ...mesmoIp, usuario: { id: 'u1' } }), reply)
      expect(reply.statusCode).toBe(200)
    }

    const estourado = resposta()
    await limitarCriacaoDeCliente(pedido({ ...mesmoIp, usuario: { id: 'u1' } }), estourado)
    expect(estourado.statusCode).toBe(429)

    const outro = resposta()
    await limitarCriacaoDeCliente(pedido({ ...mesmoIp, usuario: { id: 'u2' } }), outro)
    expect(outro.statusCode).toBe(200)
  })
})
