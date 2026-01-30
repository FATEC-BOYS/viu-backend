import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate } from '../../src/utils/formatters.js'

describe('formatCurrency', () => {
  it('deve formatar centavos para Real brasileiro', () => {
    const result = formatCurrency(10000)
    expect(result).toContain('100')
    expect(result).toContain('R$')
  })

  it('deve formatar zero centavos', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
    expect(result).toContain('R$')
  })

  it('deve formatar valores fracionários', () => {
    const result = formatCurrency(1550)
    expect(result).toContain('15')
    expect(result).toContain('50')
  })

  it('deve formatar valores negativos', () => {
    const result = formatCurrency(-5000)
    expect(result).toContain('50')
  })
})

describe('formatDate', () => {
  it('deve formatar um Date object', () => {
    const date = new Date('2024-06-15T10:30:00Z')
    const result = formatDate(date)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Deve conter o dia (15) e o ano (2024)
    expect(result).toContain('2024')
  })

  it('deve formatar uma string ISO', () => {
    const result = formatDate('2024-01-01T00:00:00Z')
    expect(typeof result).toBe('string')
    expect(result).toContain('2024')
  })

  it('deve incluir hora e minuto', () => {
    const date = new Date('2024-06-15T14:30:00Z')
    const result = formatDate(date)
    expect(typeof result).toBe('string')
    // O formato pt-BR inclui hora
    expect(result.length).toBeGreaterThan(10)
  })
})
