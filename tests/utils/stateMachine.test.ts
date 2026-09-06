import { describe, it, expect } from 'vitest'
import {
  assertValidTransition,
  PROJETO_TRANSITIONS,
  ARTE_TRANSITIONS,
  TAREFA_TRANSITIONS,
  APROVACAO_TRANSITIONS,
  FATURA_TRANSITIONS,
  PAGAMENTO_TRANSITIONS,
  SAQUE_TRANSITIONS,
  DISPUTA_TRANSITIONS,
  estadosNaoTerminais,
} from '../../src/utils/stateMachine.js'

function ok(label: string, map: Record<string, string[]>, from: string, to: string) {
  it(`${label}: ${from} → ${to} é permitido`, () => {
    expect(() => assertValidTransition(label, map, from, to)).not.toThrow()
  })
}

function fail(label: string, map: Record<string, string[]>, from: string, to: string) {
  it(`${label}: ${from} → ${to} é bloqueado`, () => {
    expect(() => assertValidTransition(label, map, from, to)).toThrow()
  })
}

// ─── Projeto ─────────────────────────────────────────────────────────────────

describe('Projeto', () => {
  ok('Projeto', PROJETO_TRANSITIONS, 'RASCUNHO', 'EM_ANDAMENTO')
  ok('Projeto', PROJETO_TRANSITIONS, 'RASCUNHO', 'CANCELADO')
  ok('Projeto', PROJETO_TRANSITIONS, 'EM_ANDAMENTO', 'PAUSADO')
  ok('Projeto', PROJETO_TRANSITIONS, 'EM_ANDAMENTO', 'CONCLUIDO')
  ok('Projeto', PROJETO_TRANSITIONS, 'EM_ANDAMENTO', 'CANCELADO')
  ok('Projeto', PROJETO_TRANSITIONS, 'PAUSADO', 'EM_ANDAMENTO')
  ok('Projeto', PROJETO_TRANSITIONS, 'PAUSADO', 'CANCELADO')

  fail('Projeto', PROJETO_TRANSITIONS, 'RASCUNHO', 'PAUSADO')
  fail('Projeto', PROJETO_TRANSITIONS, 'RASCUNHO', 'CONCLUIDO')
  fail('Projeto', PROJETO_TRANSITIONS, 'CONCLUIDO', 'EM_ANDAMENTO')
  fail('Projeto', PROJETO_TRANSITIONS, 'CONCLUIDO', 'PAUSADO')
  fail('Projeto', PROJETO_TRANSITIONS, 'CANCELADO', 'EM_ANDAMENTO')
  fail('Projeto', PROJETO_TRANSITIONS, 'CANCELADO', 'CONCLUIDO')
  fail('Projeto', PROJETO_TRANSITIONS, 'PAUSADO', 'CONCLUIDO')
})

// ─── Arte ─────────────────────────────────────────────────────────────────────

describe('Arte', () => {
  ok('Arte', ARTE_TRANSITIONS, 'EM_ANALISE', 'APROVADO')
  ok('Arte', ARTE_TRANSITIONS, 'EM_ANALISE', 'REJEITADO')
  ok('Arte', ARTE_TRANSITIONS, 'REJEITADO', 'EM_ANALISE')

  fail('Arte', ARTE_TRANSITIONS, 'APROVADO', 'REJEITADO')
  fail('Arte', ARTE_TRANSITIONS, 'APROVADO', 'EM_ANALISE')
  fail('Arte', ARTE_TRANSITIONS, 'REJEITADO', 'APROVADO')
})

// ─── Tarefa ───────────────────────────────────────────────────────────────────

describe('Tarefa', () => {
  ok('Tarefa', TAREFA_TRANSITIONS, 'PENDENTE', 'EM_ANDAMENTO')
  ok('Tarefa', TAREFA_TRANSITIONS, 'PENDENTE', 'CANCELADA')
  ok('Tarefa', TAREFA_TRANSITIONS, 'EM_ANDAMENTO', 'CONCLUIDA')
  ok('Tarefa', TAREFA_TRANSITIONS, 'EM_ANDAMENTO', 'PENDENTE')
  ok('Tarefa', TAREFA_TRANSITIONS, 'CONCLUIDA', 'EM_ANDAMENTO')

  fail('Tarefa', TAREFA_TRANSITIONS, 'CANCELADA', 'PENDENTE')
  fail('Tarefa', TAREFA_TRANSITIONS, 'CANCELADA', 'EM_ANDAMENTO')
  fail('Tarefa', TAREFA_TRANSITIONS, 'PENDENTE', 'CONCLUIDA')
})

// ─── Aprovação ────────────────────────────────────────────────────────────────

describe('Aprovação', () => {
  ok('Aprovação', APROVACAO_TRANSITIONS, 'PENDENTE', 'APROVADO')
  ok('Aprovação', APROVACAO_TRANSITIONS, 'PENDENTE', 'REJEITADO')

  fail('Aprovação', APROVACAO_TRANSITIONS, 'APROVADO', 'REJEITADO')
  fail('Aprovação', APROVACAO_TRANSITIONS, 'APROVADO', 'PENDENTE')
  fail('Aprovação', APROVACAO_TRANSITIONS, 'REJEITADO', 'APROVADO')
  fail('Aprovação', APROVACAO_TRANSITIONS, 'REJEITADO', 'PENDENTE')
})

// ─── Fatura ───────────────────────────────────────────────────────────────────

describe('Fatura', () => {
  ok('Fatura', FATURA_TRANSITIONS, 'PENDENTE', 'PAGA')
  ok('Fatura', FATURA_TRANSITIONS, 'PENDENTE', 'CANCELADA')
  ok('Fatura', FATURA_TRANSITIONS, 'PAGA', 'ESTORNADA')

  fail('Fatura', FATURA_TRANSITIONS, 'CANCELADA', 'PENDENTE')
  fail('Fatura', FATURA_TRANSITIONS, 'CANCELADA', 'PAGA')
  fail('Fatura', FATURA_TRANSITIONS, 'PAGA', 'CANCELADA')
  fail('Fatura', FATURA_TRANSITIONS, 'ESTORNADA', 'PENDENTE')
})

// ─── Pagamento ────────────────────────────────────────────────────────────────

describe('Pagamento', () => {
  ok('Pagamento', PAGAMENTO_TRANSITIONS, 'PENDENTE', 'APROVADO')
  ok('Pagamento', PAGAMENTO_TRANSITIONS, 'PENDENTE', 'REJEITADO')
  ok('Pagamento', PAGAMENTO_TRANSITIONS, 'PENDENTE', 'PROCESSANDO')
  ok('Pagamento', PAGAMENTO_TRANSITIONS, 'PROCESSANDO', 'APROVADO')
  ok('Pagamento', PAGAMENTO_TRANSITIONS, 'APROVADO', 'ESTORNADO')

  fail('Pagamento', PAGAMENTO_TRANSITIONS, 'APROVADO', 'PENDENTE')
  fail('Pagamento', PAGAMENTO_TRANSITIONS, 'REJEITADO', 'APROVADO')
  fail('Pagamento', PAGAMENTO_TRANSITIONS, 'ESTORNADO', 'APROVADO')
  fail('Pagamento', PAGAMENTO_TRANSITIONS, 'CANCELADO', 'APROVADO')
})

// ─── Saque ───────────────────────────────────────────────────────────────────

describe('Saque', () => {
  ok('Saque', SAQUE_TRANSITIONS, 'SOLICITADO', 'PROCESSANDO')
  ok('Saque', SAQUE_TRANSITIONS, 'SOLICITADO', 'CANCELADO')
  ok('Saque', SAQUE_TRANSITIONS, 'PROCESSANDO', 'CONCLUIDO')
  ok('Saque', SAQUE_TRANSITIONS, 'PROCESSANDO', 'CANCELADO')

  fail('Saque', SAQUE_TRANSITIONS, 'CONCLUIDO', 'SOLICITADO')
  fail('Saque', SAQUE_TRANSITIONS, 'CANCELADO', 'SOLICITADO')
  fail('Saque', SAQUE_TRANSITIONS, 'SOLICITADO', 'CONCLUIDO')
})

// ─── Disputa ─────────────────────────────────────────────────────────────────

describe('Disputa', () => {
  ok('Disputa', DISPUTA_TRANSITIONS, 'ABERTA', 'EM_ANALISE')
  ok('Disputa', DISPUTA_TRANSITIONS, 'ABERTA', 'RESOLVIDA_DESIGNER')
  ok('Disputa', DISPUTA_TRANSITIONS, 'EM_ANALISE', 'ESCALADA')
  ok('Disputa', DISPUTA_TRANSITIONS, 'ESCALADA', 'RESOLVIDA_CLIENTE')

  fail('Disputa', DISPUTA_TRANSITIONS, 'RESOLVIDA_DESIGNER', 'ABERTA')
  fail('Disputa', DISPUTA_TRANSITIONS, 'RESOLVIDA_CLIENTE', 'EM_ANALISE')
  fail('Disputa', DISPUTA_TRANSITIONS, 'ESCALADA', 'ABERTA')
})

// ─── Status desconhecido ──────────────────────────────────────────────────────

describe('assertValidTransition — status desconhecido', () => {
  it('lança erro para status de origem desconhecido', () => {
    expect(() => assertValidTransition('Projeto', PROJETO_TRANSITIONS, 'INVALIDO', 'EM_ANDAMENTO'))
      .toThrow('Status desconhecido')
  })
})

describe('estadosNaoTerminais', () => {
  it('devolve só os estados de onde ainda se pode sair', () => {
    expect(estadosNaoTerminais(DISPUTA_TRANSITIONS).sort()).toEqual(
      ['ABERTA', 'EM_ANALISE', 'ESCALADA'],
    )
  })

  it('exclui os terminais — é o que impede travar saldo de disputa resolvida', () => {
    const naoTerminais = estadosNaoTerminais(DISPUTA_TRANSITIONS)
    expect(naoTerminais).not.toContain('RESOLVIDA_DESIGNER')
    expect(naoTerminais).not.toContain('RESOLVIDA_CLIENTE')
  })

  it('vale para qualquer máquina, não só disputa', () => {
    expect(estadosNaoTerminais(SAQUE_TRANSITIONS).sort()).toEqual(
      ['PROCESSANDO', 'SOLICITADO'],
    )
  })
})
