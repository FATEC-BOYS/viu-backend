import { describe, it, expect } from 'vitest'
import {
  cpfValido,
  cnpjValido,
  cepValido,
  formatarDocumento,
  formatarCep,
  soDigitos,
} from '../../src/utils/documentos.js'

/*
 * O CNPJ entra aqui pela primeira vez, então o vetor de teste foi conferido à
 * mão antes de virar asserção — 11.222.333/0001-81, o exemplo canônico:
 *
 *   DV1: pesos 5 4 3 2 9 8 7 6 5 4 3 2 sobre 112223330001 → soma 102,
 *        102 % 11 = 3, e 11 − 3 = 8 ✓
 *   DV2: pesos 6 5 4 3 2 9 8 7 6 5 4 3 2 sobre 1122233300018 → soma 120,
 *        120 % 11 = 10, e 11 − 10 = 1 ✓
 *
 * Conferir o algoritmo com números que ele próprio gerou não prova nada; por
 * isso a conta acima foi feita fora dele.
 */
describe('CNPJ', () => {
  it('aceita um CNPJ com dígitos verificadores corretos', () => {
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
  })

  it('recusa quando qualquer dígito muda', () => {
    // Trocar um dígito da base quebra os dois verificadores.
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(cnpjValido('11222333000191')).toBe(false)
    expect(cnpjValido('21222333000181')).toBe(false)
  })

  it('recusa tamanho errado', () => {
    expect(cnpjValido('1122233300018')).toBe(false)
    expect(cnpjValido('112223330001812')).toBe(false)
    expect(cnpjValido('')).toBe(false)
  })

  /* Fecham a conta e não existem — a mesma armadilha do CPF. */
  it('recusa todos os dígitos iguais', () => {
    expect(cnpjValido('00000000000000')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
  })
})

describe('CPF', () => {
  it('continua valendo depois de sair de validation.ts', () => {
    // O mesmo CPF que o teste de chave PIX já usava.
    expect(cpfValido('52998224725')).toBe(true)
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
  })
})

describe('CEP', () => {
  it('conta dígitos e ignora o hífen', () => {
    expect(cepValido('01310-100')).toBe(true)
    expect(cepValido('01310100')).toBe(true)
    expect(cepValido('0131010')).toBe(false)
  })
})

/* Formato é assunto de quem exibe; o banco guarda só dígitos. */
describe('Como se escreve de volta', () => {
  it('escreve CPF e CNPJ na pontuação que a pessoa reconhece', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('devolve intacto o que não tem tamanho de documento', () => {
    expect(formatarDocumento('123')).toBe('123')
  })

  it('escreve o CEP com hífen', () => {
    expect(formatarCep('01310100')).toBe('01310-100')
  })

  it('tira a pontuação de volta', () => {
    expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181')
  })
})
