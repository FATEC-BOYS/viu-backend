import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import {
  termosVigentes,
  registrarAceiteTermos,
  estadoAceiteTermos,
} from '../../src/services/termosPlataformaService.js'
import { TERMOS_VERSAO, TEXTO_TERMOS } from '../../src/templates/termosPlataforma.js'

const db = prisma as any
const USUARIO = 'cu00000000000000000000001'

beforeEach(() => vi.clearAllMocks())

/**
 * O aceite dos termos era fantasma: `projetoController` gravava
 * `termoVersao: "1.0"` apontando para um documento que não existia, no momento
 * errado, e nenhuma tela lia de volta. Provava o clique, não o que foi lido.
 */
describe('o texto dos termos', () => {
  it('tem hash — é ele que prova o que a pessoa leu', () => {
    const t = termosVigentes()
    expect(t.hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('o hash é do texto, não de outra coisa', async () => {
    const { createHash } = await import('crypto')
    const esperado = createHash('sha256').update(TEXTO_TERMOS, 'utf8').digest('hex')
    expect(termosVigentes().hash).toBe(esperado)
  })

  it('avisa que ainda não passou por advogado', () => {
    // A tela lê daqui: o aviso some sozinho quando a revisão chegar, sem
    // depender de alguém lembrar de apagar um texto.
    expect(termosVigentes().revisadoJuridicamente).toBe(false)
    expect(TEXTO_TERMOS).toContain('PENDENTE DE REVISÃO JURÍDICA')
  })

  it('a versão viaja junto — sem ela o aceite não diz o quê', () => {
    expect(termosVigentes().versao).toBe(TERMOS_VERSAO)
    expect(TEXTO_TERMOS).toContain(TERMOS_VERSAO)
  })

  it('cobre o que o produto realmente faz, não um modelo genérico', () => {
    // Registro de IP em aceites, links encaminháveis, taxa sobre fatura e o
    // beta sem garantia de disponibilidade: cada um é comportamento que existe.
    expect(TEXTO_TERMOS).toContain('LGPD')
    expect(TEXTO_TERMOS).toMatch(/endereço de IP/i)
    expect(TEXTO_TERMOS).toMatch(/link encaminhado/i)
    expect(TEXTO_TERMOS).toMatch(/taxa do plano/i)
  })

  it('não promete o que o VIU não faz', () => {
    expect(TEXTO_TERMOS).toMatch(/não é escritório de advocacia/i)
    expect(TEXTO_TERMOS).toMatch(/não substitui contrato de design/i)
  })

  it('é texto puro — o hash cobre o que foi lido, não um fonte markdown', () => {
    expect(TEXTO_TERMOS).not.toContain('**')
    expect(TEXTO_TERMOS).not.toMatch(/^#+ /m)
  })
})

describe('gravar o aceite', () => {
  it('grava versão e hash, não só a data do clique', async () => {
    db.aceiteTermos.create.mockResolvedValue({ id: 'a1' })
    await registrarAceiteTermos({ usuarioId: USUARIO, ip: '1.2.3.4', userAgent: 'Firefox' })

    expect(db.aceiteTermos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: USUARIO,
        versao: TERMOS_VERSAO,
        hash: termosVigentes().hash,
        ip: '1.2.3.4',
      }),
    })
  })

  it('aceitar duas vezes a mesma versão não duplica nem explode', async () => {
    // Clique repetido ou reenvio de formulário é o mesmo fato.
    db.aceiteTermos.create.mockRejectedValue({ code: 'P2002' })
    db.aceiteTermos.findFirst.mockResolvedValue({ id: 'ja-existia' })

    await expect(registrarAceiteTermos({ usuarioId: USUARIO })).resolves.toEqual({ id: 'ja-existia' })
  })

  it('erro que não é duplicata sobe — falha de banco não vira aceite silencioso', async () => {
    db.aceiteTermos.create.mockRejectedValue({ code: 'P1001' })
    await expect(registrarAceiteTermos({ usuarioId: USUARIO })).rejects.toBeTruthy()
  })

  it('nunca atualiza uma linha existente', async () => {
    // Aceite é fato histórico. Foi o `upsert` que apagava a prova anterior no
    // fluxo do contrato de projeto, e o erro não se repete aqui.
    db.aceiteTermos.create.mockResolvedValue({ id: 'a1' })
    await registrarAceiteTermos({ usuarioId: USUARIO })
    expect(db.aceiteTermos.update).not.toHaveBeenCalled()
    expect(db.aceiteTermos.upsert).not.toHaveBeenCalled()
  })
})

describe('quem aceitou o quê', () => {
  it('quem aceitou a versão vigente está em dia', async () => {
    db.aceiteTermos.findFirst.mockResolvedValue({
      versao: TERMOS_VERSAO,
      criadoEm: new Date('2026-09-13T10:00:00.000Z'),
    })
    const e = await estadoAceiteTermos(USUARIO)
    expect(e.aceitouVigente).toBe(true)
  })

  it('quem aceitou uma versão antiga NÃO está em dia', async () => {
    /*
     * A comparação é por versão e não por "existe alguma linha". Quando a
     * redação mudar, quem aceitou a anterior precisa aceitar de novo — um
     * booleano solitário esconderia isso.
     */
    db.aceiteTermos.findFirst.mockResolvedValue({
      versao: 'termos-plataforma@0',
      criadoEm: new Date('2026-01-01T10:00:00.000Z'),
    })
    const e = await estadoAceiteTermos(USUARIO)
    expect(e.aceitouVigente).toBe(false)
    expect(e.versaoAceita).toBe('termos-plataforma@0')
  })

  it('conta criada pelo designer nunca aceitou — e isso aparece', async () => {
    // O cliente cadastrado pelo wizard não esteve na frente da tela. Dizer
    // "aceitou" por ele seria fabricar a prova que este módulo existe para ter.
    db.aceiteTermos.findFirst.mockResolvedValue(null)
    const e = await estadoAceiteTermos(USUARIO)
    expect(e.aceitouVigente).toBe(false)
    expect(e.versaoAceita).toBeNull()
    expect(e.aceitoEm).toBeNull()
  })
})
