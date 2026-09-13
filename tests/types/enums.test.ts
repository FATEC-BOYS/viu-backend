import { describe, it, expect } from 'vitest'
import {
  TipoUsuario, StatusProjeto, TipoArte, StatusArte,
  TipoFeedback, StatusAprovacao, StatusTarefa, Prioridade,
  TipoNotificacao, CanalNotificacao,
  TIPOS_USUARIO, STATUS_PROJETO, TIPOS_ARTE, STATUS_ARTE,
  TIPOS_FEEDBACK, STATUS_APROVACAO, STATUS_TAREFA, PRIORIDADES,
  TIPOS_NOTIFICACAO, CANAIS_NOTIFICACAO,
  isValidTipoUsuario, isValidStatusProjeto, isValidTipoArte,
  isValidStatusArte, isValidTipoFeedback, isValidStatusAprovacao,
  isValidStatusTarefa, isValidPrioridade, isValidTipoNotificacao,
  isValidCanalNotificacao,
} from '../../src/types/enums.js'
import { ARTE_TRANSITIONS } from '../../src/utils/stateMachine.js'

describe('Enums - constantes', () => {
  it('TipoUsuario deve conter DESIGNER, CLIENTE e ADMIN', () => {
    expect(TipoUsuario.DESIGNER).toBe('DESIGNER')
    expect(TipoUsuario.CLIENTE).toBe('CLIENTE')
    expect(TipoUsuario.ADMIN).toBe('ADMIN')
  })

  it('StatusProjeto deve conter todos os status', () => {
    expect(STATUS_PROJETO).toEqual(['EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO'])
  })

  it('TipoArte deve conter todos os tipos', () => {
    expect(TIPOS_ARTE).toEqual(['IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO', 'OUTRO'])
  })

  it('StatusArte deve conter todos os status', () => {
    // `REVISAO` saiu: não era chave nem destino em `ARTE_TRANSITIONS`, então
    // arte que chegasse lá não saía mais — `assertValidTransition` respondia
    // "Status desconhecido para Arte" a qualquer mudança.
    expect(STATUS_ARTE).toEqual(['EM_ANALISE', 'APROVADO', 'REJEITADO'])
  })

  /*
   * O invariante que faltava, e cuja ausência deixou `REVISAO` existir por
   * tempo indeterminado: a lista de status e a máquina de estados descrevem a
   * mesma coisa, e um status que a máquina não conhece é uma arte travada —
   * `assertValidTransition` lê `transitions[from]`, acha `undefined` e recusa
   * tudo. Este teste é o que teria denunciado aquilo no dia em que apareceu.
   */
  it('todo status de arte é conhecido pela máquina de estados', () => {
    const conhecidos = Object.keys(ARTE_TRANSITIONS)
    expect([...STATUS_ARTE].sort()).toEqual(conhecidos.sort())
  })

  it('nenhum status de arte é um beco sem saída inesperado', () => {
    // APROVADO é terminal de propósito — arte aprovada não volta atrás. Os
    // demais precisam ter para onde ir, senão travam quem chegar neles.
    for (const status of STATUS_ARTE) {
      if (status === 'APROVADO') continue
      expect(ARTE_TRANSITIONS[status].length).toBeGreaterThan(0)
    }
  })

  it('TipoFeedback deve conter TEXTO, AUDIO e POSICIONAL', () => {
    expect(TIPOS_FEEDBACK).toEqual(['TEXTO', 'AUDIO', 'POSICIONAL'])
  })

  it('StatusAprovacao deve conter PENDENTE, APROVADO e REJEITADO', () => {
    expect(STATUS_APROVACAO).toEqual(['PENDENTE', 'APROVADO', 'REJEITADO'])
  })

  it('StatusTarefa deve conter todos os status', () => {
    expect(STATUS_TAREFA).toEqual(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])
  })

  it('Prioridade deve conter todos os níveis', () => {
    expect(PRIORIDADES).toEqual(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'])
  })

  it('TipoNotificacao deve conter todos os tipos', () => {
    expect(TIPOS_NOTIFICACAO).toHaveLength(6)
  })

  it('CanalNotificacao deve conter todos os canais', () => {
    expect(CANAIS_NOTIFICACAO).toEqual(['SISTEMA', 'EMAIL', 'PUSH', 'SMS'])
  })
})

describe('Funções de validação', () => {
  it('isValidTipoUsuario retorna true para valores válidos', () => {
    expect(isValidTipoUsuario('DESIGNER')).toBe(true)
    expect(isValidTipoUsuario('CLIENTE')).toBe(true)
    expect(isValidTipoUsuario('ADMIN')).toBe(true)
  })

  it('isValidTipoUsuario retorna false para valores inválidos', () => {
    expect(isValidTipoUsuario('INVALIDO')).toBe(false)
    expect(isValidTipoUsuario('')).toBe(false)
  })

  it('isValidStatusProjeto funciona corretamente', () => {
    expect(isValidStatusProjeto('EM_ANDAMENTO')).toBe(true)
    expect(isValidStatusProjeto('INVALIDO')).toBe(false)
  })

  it('isValidTipoArte funciona corretamente', () => {
    expect(isValidTipoArte('IMAGEM')).toBe(true)
    expect(isValidTipoArte('INVALIDO')).toBe(false)
  })

  it('isValidStatusArte funciona corretamente', () => {
    expect(isValidStatusArte('EM_ANALISE')).toBe(true)
    expect(isValidStatusArte('INVALIDO')).toBe(false)
  })

  it('isValidTipoFeedback funciona corretamente', () => {
    expect(isValidTipoFeedback('TEXTO')).toBe(true)
    expect(isValidTipoFeedback('INVALIDO')).toBe(false)
  })

  it('isValidStatusAprovacao funciona corretamente', () => {
    expect(isValidStatusAprovacao('PENDENTE')).toBe(true)
    expect(isValidStatusAprovacao('INVALIDO')).toBe(false)
  })

  it('isValidStatusTarefa funciona corretamente', () => {
    expect(isValidStatusTarefa('PENDENTE')).toBe(true)
    expect(isValidStatusTarefa('INVALIDO')).toBe(false)
  })

  it('isValidPrioridade funciona corretamente', () => {
    expect(isValidPrioridade('ALTA')).toBe(true)
    expect(isValidPrioridade('INVALIDO')).toBe(false)
  })

  it('isValidTipoNotificacao funciona corretamente', () => {
    expect(isValidTipoNotificacao('NOVO_PROJETO')).toBe(true)
    expect(isValidTipoNotificacao('INVALIDO')).toBe(false)
  })

  it('isValidCanalNotificacao funciona corretamente', () => {
    expect(isValidCanalNotificacao('EMAIL')).toBe(true)
    expect(isValidCanalNotificacao('INVALIDO')).toBe(false)
  })
})
