import { describe, it, expect } from 'vitest'
import { inicioDoDia, FUSO_PADRAO } from '../../src/services/adminResumoService.js'

/**
 * "Hoje" precisa ser o dia de quem está olhando o painel.
 *
 * Contado em UTC, o card zera às 21h de São Paulo e as três últimas horas do
 * dia aparecem como movimento de amanhã — o número fica certo para o servidor
 * e errado para a pessoa.
 */
describe('inicioDoDia', () => {
  it('devolve a meia-noite de São Paulo, não a de UTC', () => {
    // 08/09 às 23h em São Paulo já é 09/09 às 02h em UTC.
    const agora = new Date('2026-09-09T02:00:00.000Z')
    expect(inicioDoDia(FUSO_PADRAO, agora).toISOString()).toBe('2026-09-08T03:00:00.000Z')
  })

  it('vira o dia junto com o fuso, e não três horas antes', () => {
    const antesDaMeiaNoite = new Date('2026-09-09T02:59:59.000Z') // 23:59:59 em SP
    const depoisDaMeiaNoite = new Date('2026-09-09T03:00:01.000Z') // 00:00:01 em SP

    expect(inicioDoDia(FUSO_PADRAO, antesDaMeiaNoite).toISOString()).toBe('2026-09-08T03:00:00.000Z')
    expect(inicioDoDia(FUSO_PADRAO, depoisDaMeiaNoite).toISOString()).toBe('2026-09-09T03:00:00.000Z')
  })

  /** O deslocamento é lido do Intl; nada de -03:00 escrito à mão. */
  it('funciona para outro fuso, com outro deslocamento', () => {
    const agora = new Date('2026-09-09T02:00:00.000Z')
    expect(inicioDoDia('UTC', agora).toISOString()).toBe('2026-09-09T00:00:00.000Z')
    expect(inicioDoDia('Asia/Tokyo', agora).toISOString()).toBe('2026-09-08T15:00:00.000Z')
  })
})
