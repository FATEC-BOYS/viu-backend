import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFunil } from '../../src/controllers/funilController.js'

/**
 * O funil é de quem entrega.
 *
 * Um cliente perguntando aqui receberia zero — as artes são dos projetos em
 * que ele é cliente, não designer — e zero tem cara de resposta. Recusar é
 * mais honesto que devolver um panorama vazio que não é dele.
 */

vi.mock('../../src/services/funilService.js', () => ({
  funilService: { funilDoDesigner: vi.fn().mockResolvedValue({ compartilhadas: 0 }) },
}))

import { funilService } from '../../src/services/funilService.js'

function requisicao(tipo: string) {
  return { usuario: { id: 'u1', tipo }, log: { error: vi.fn() } } as any
}

function resposta() {
  const r: any = {
    codigo: 200,
    corpo: null as any,
    status(c: number) { r.codigo = c; return r },
    send(b: any) { r.corpo = b; return r },
  }
  return r
}

beforeEach(() => vi.clearAllMocks())

describe('quem enxerga o funil', () => {
  it('recusa o cliente em vez de devolver um panorama vazio', async () => {
    const reply = resposta()
    await getFunil(requisicao('CLIENTE'), reply)

    expect(reply.codigo).toBe(403)
    expect(funilService.funilDoDesigner).not.toHaveBeenCalled()
  })

  it('responde ao designer com o próprio funil', async () => {
    const reply = resposta()
    await getFunil(requisicao('DESIGNER'), reply)

    expect(reply.codigo).toBe(200)
    expect(funilService.funilDoDesigner).toHaveBeenCalledWith('u1')
  })

  it('admin também enxerga — é quem sustenta o beta', async () => {
    const reply = resposta()
    await getFunil(requisicao('ADMIN'), reply)

    expect(reply.codigo).toBe(200)
  })
})
