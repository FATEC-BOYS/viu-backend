import { describe, it, expect } from 'vitest'
import { CadastrarChavePixSchema } from '../../src/schemas/validation.js'

/**
 * A chave precisa ter a cara do tipo que ela diz ser.
 *
 * `chave` era `z.string().min(1).max(256)`: conferido contra o servidor, os
 * quatro tipos aceitavam lixo — `tipo: 'CPF'` com `chave: 'banana'` entrava.
 * Isto é o fim de um caminho de dinheiro: o designer cadastra, pede o saque, e
 * a transferência falha lá na frente, quando ele já está esperando o dinheiro
 * cair.
 */
function cadastrar(tipo: string, chave: string) {
  return CadastrarChavePixSchema.safeParse({ tipo, chave, titular: 'Ana Silva' })
}

describe('Chave PIX precisa ter o formato do próprio tipo', () => {
  it.each([
    ['CPF', 'banana'],
    ['EMAIL', 'nao-e-email'],
    ['TELEFONE', 'abc'],
    ['ALEATORIA', '123'],
  ])('recusa %s com %s', (tipo, chave) => {
    expect(cadastrar(tipo, chave).success).toBe(false)
  })

  it.each([
    ['CPF', '529.982.247-25'],
    ['CPF', '52998224725'],
    ['EMAIL', 'ana@estudio.com'],
    ['TELEFONE', '11987654321'],
    ['TELEFONE', '+55 11 98765-4321'],
    ['ALEATORIA', '123e4567-e89b-12d3-a456-426614174000'],
    ['ALEATORIA', '123e4567e89b12d3a456426614174000'],
  ])('aceita %s válido: %s', (tipo, chave) => {
    expect(cadastrar(tipo, chave).success).toBe(true)
  })

  /*
   * Onze dígitos quaisquer não são um CPF, e é justamente o erro de digitação
   * que se quer pegar: trocar um número gera uma sequência plausível que só os
   * dígitos verificadores denunciam.
   */
  it('recusa CPF com dígito verificador errado', () => {
    expect(cadastrar('CPF', '52998224726').success).toBe(false)
  })

  it('recusa CPF de dígitos repetidos, que passa no cálculo mas não existe', () => {
    expect(cadastrar('CPF', '11111111111').success).toBe(false)
  })

  it('a mensagem diz qual campo está errado', () => {
    const r = cadastrar('TELEFONE', 'abc')
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['chave'])
      expect(r.error.issues[0].message).toMatch(/Telefone inválido/)
    }
  })

  it('espaço em volta não reprova uma chave boa', () => {
    expect(cadastrar('EMAIL', '  ana@estudio.com  ').success).toBe(true)
  })
})
