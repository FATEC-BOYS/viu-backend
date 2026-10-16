import { describe, expect, it } from 'vitest'
import { validarAjustes } from '../../src/services/ajustesService.js'
describe('sugestões de ajustes', () => {
  it('aceita ausência de pedidos', () => { expect(validarAjustes({ ajustes: [] }, 'Gostei!').ajustes).toEqual([]) })
  it('exige evidência literal do comentário', () => {
    expect(() => validarAjustes({ ajustes: [{ descricao: 'Trocar azul', trechoOriginal: 'troca o azul' }] }, 'Não muda o logo')).toThrow()
  })
  it('preserva o trecho com condição e negação para revisão', () => {
    const texto = 'Talvez aumentar o título, mas não mudar a fonte.'
    expect(validarAjustes({ ajustes: [{ descricao: texto, trechoOriginal: texto }] }, texto).ajustes[0]?.descricao).toBe(texto)
  })
  it('recusa formato inesperado e listas excessivas', () => {
    expect(() => validarAjustes({ ajustes: ['mudar logo'] }, 'mudar logo')).toThrow()
    expect(() => validarAjustes({ ajustes: Array(13).fill({ descricao: 'mudar', trechoOriginal: 'mudar' }) }, 'mudar')).toThrow()
  })
})
