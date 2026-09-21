import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { DadosFiscaisService } from '../../src/services/dadosFiscaisService.js'
import { DadosFiscaisSchema } from '../../src/schemas/validation.js'

const service = new DadosFiscaisService()

const PJ = {
  tipoPessoa: 'JURIDICA' as const,
  documento: '11.222.333/0001-81',
  razaoSocial: 'Estúdio Acme Ltda',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
}

beforeEach(() => vi.clearAllMocks())

/*
 * O VIU ainda não emite nota — os termos dizem isso na cláusula 4.2. Mas
 * emitir depende destes campos, e não havia nenhum deles em lugar nenhum do
 * sistema. Sem endereço completo e sem documento conferido, o emissor recusa a
 * nota, e a recusa chega fora do produto, quando alguém já espera o documento.
 */
describe('O que o formulário fiscal aceita', () => {
  it('aceita pessoa jurídica com CNPJ válido', () => {
    expect(DadosFiscaisSchema.safeParse(PJ).success).toBe(true)
  })

  /*
   * O par tipo/documento é conferido aqui porque é aqui que ainda dá para
   * corrigir. Sair com tomador de um tipo e documento de outro é nota recusada
   * pela prefeitura.
   */
  it('recusa CPF numa conta declarada como jurídica', () => {
    const r = DadosFiscaisSchema.safeParse({ ...PJ, documento: '529.982.247-25' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('CNPJ inválido')
  })

  it('recusa CNPJ numa conta declarada como física', () => {
    const r = DadosFiscaisSchema.safeParse({ ...PJ, tipoPessoa: 'FISICA' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toBe('CPF inválido')
  })

  it('aceita pessoa física com CPF válido', () => {
    const r = DadosFiscaisSchema.safeParse({
      ...PJ,
      tipoPessoa: 'FISICA',
      documento: '529.982.247-25',
      razaoSocial: 'Ana Silva',
    })
    expect(r.success).toBe(true)
  })

  /* Guardar as duas formas do mesmo CNPJ seria guardar duas verdades. */
  it('guarda documento e CEP só com dígitos', () => {
    const r = DadosFiscaisSchema.safeParse(PJ)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.documento).toBe('11222333000181')
      expect(r.data.cep).toBe('01310100')
    }
  })

  it('recusa UF que não existe e aceita em minúscula', () => {
    expect(DadosFiscaisSchema.safeParse({ ...PJ, uf: 'XX' }).success).toBe(false)
    expect(DadosFiscaisSchema.safeParse({ ...PJ, uf: 'sp' }).success).toBe(true)
  })

  it('recusa CEP com o número errado de dígitos', () => {
    const r = DadosFiscaisSchema.safeParse({ ...PJ, cep: '0131010' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/oito dígitos/)
  })

  /* Endereço pela metade não emite nota: o conjunto só vale inteiro. */
  it('exige o endereço completo', () => {
    for (const campo of ['logradouro', 'numero', 'bairro', 'cidade'] as const) {
      const r = DadosFiscaisSchema.safeParse({ ...PJ, [campo]: '' })
      expect(r.success, campo).toBe(false)
    }
  })
})

describe('Guardar e ler os dados fiscais', () => {
  it('formata documento e CEP na leitura, num lugar só', async () => {
    vi.mocked(prisma.dadosFiscais.findUnique).mockResolvedValue({
      documento: '11222333000181',
      cep: '01310100',
    } as never)

    const d = await service.getDadosFiscais('u1')

    expect(d?.documentoFormatado).toBe('11.222.333/0001-81')
    expect(d?.cepFormatado).toBe('01310-100')
  })

  it('responde null para quem ainda não preencheu, sem estourar', async () => {
    vi.mocked(prisma.dadosFiscais.findUnique).mockResolvedValue(null as never)
    await expect(service.getDadosFiscais('u1')).resolves.toBeNull()
  })

  /* Um PATCH parcial deixaria a conta parecendo preenchida sem servir. */
  it('substitui o conjunto inteiro, e prende ao usuário da sessão', async () => {
    vi.mocked(prisma.dadosFiscais.upsert).mockResolvedValue({
      documento: '11222333000181',
      cep: '01310100',
    } as never)

    await service.salvarDadosFiscais('u1', { ...PJ, documento: '11222333000181', cep: '01310100' })

    const chamada = vi.mocked(prisma.dadosFiscais.upsert).mock.calls[0][0] as any
    expect(chamada.where).toEqual({ usuarioId: 'u1' })
    expect(chamada.create.usuarioId).toBe('u1')
    // Opcionais ausentes viram null explícito, e não some do update: sem isso,
    // limpar o nome fantasia não limparia nada.
    expect(chamada.update.nomeFantasia).toBeNull()
    expect(chamada.update.complemento).toBeNull()
  })

  it('apagar o que não existe não é erro', async () => {
    vi.mocked(prisma.dadosFiscais.deleteMany).mockResolvedValue({ count: 0 } as never)
    await expect(service.removerDadosFiscais('u1')).resolves.toBeUndefined()
  })
})
