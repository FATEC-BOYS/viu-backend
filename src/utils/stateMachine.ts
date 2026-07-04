/**
 * Máquina de estados para as entidades do domínio.
 *
 * Cada mapa define as transições PERMITIDAS: dado o status atual,
 * quais são os próximos estados válidos. Um array vazio significa
 * estado terminal — nenhuma transição é permitida a partir dele.
 *
 * Use assertValidTransition() nos services antes de qualquer update de status.
 */

type TransitionMap = Record<string, string[]>

// ─── Definições de transição ─────────────────────────────────────────────────

export const PROJETO_TRANSITIONS: TransitionMap = {
  // RASCUNHO: aguardando aceite do convite pela outra parte
  RASCUNHO:     ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['PAUSADO', 'CONCLUIDO', 'CANCELADO'],
  PAUSADO:      ['EM_ANDAMENTO', 'CANCELADO'],
  CONCLUIDO:    [],
  CANCELADO:    [],
}

// APROVADO é terminal: arte aprovada não volta para análise.
// REJEITADO pode retornar para EM_ANALISE quando o designer resubmete.
export const ARTE_TRANSITIONS: TransitionMap = {
  EM_ANALISE: ['APROVADO', 'REJEITADO'],
  APROVADO:   [],
  REJEITADO:  ['EM_ANALISE'],
}

export const TAREFA_TRANSITIONS: TransitionMap = {
  PENDENTE:     ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA', 'PENDENTE'],
  CONCLUIDA:    ['EM_ANDAMENTO'],
  CANCELADA:    [],
}

export const APROVACAO_TRANSITIONS: TransitionMap = {
  PENDENTE:  ['APROVADO', 'REJEITADO'],
  APROVADO:  [],
  REJEITADO: [],
}

// Pagamentos controlados principalmente via webhook do gateway.
export const FATURA_TRANSITIONS: TransitionMap = {
  PENDENTE:  ['PAGA', 'CANCELADA'],
  PAGA:      ['ESTORNADA'],
  CANCELADA: [],
  ESTORNADA: [],
}

export const PAGAMENTO_TRANSITIONS: TransitionMap = {
  PENDENTE:    ['PROCESSANDO', 'APROVADO', 'REJEITADO', 'CANCELADO'],
  PROCESSANDO: ['APROVADO', 'REJEITADO', 'CANCELADO'],
  APROVADO:    ['ESTORNADO'],
  REJEITADO:   [],
  CANCELADO:   [],
  ESTORNADO:   [],
}

// Saques processados por admins — designer só solicita.
export const SAQUE_TRANSITIONS: TransitionMap = {
  SOLICITADO:  ['PROCESSANDO', 'CANCELADO'],
  PROCESSANDO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO:   [],
  CANCELADO:   [],
}

export const DISPUTA_TRANSITIONS: TransitionMap = {
  ABERTA:            ['EM_ANALISE', 'RESOLVIDA_DESIGNER', 'RESOLVIDA_CLIENTE', 'ESCALADA'],
  EM_ANALISE:        ['RESOLVIDA_DESIGNER', 'RESOLVIDA_CLIENTE', 'ESCALADA'],
  ESCALADA:          ['RESOLVIDA_DESIGNER', 'RESOLVIDA_CLIENTE'],
  RESOLVIDA_DESIGNER: [],
  RESOLVIDA_CLIENTE:  [],
}

// ─── Validação ────────────────────────────────────────────────────────────────

export function assertValidTransition(
  entity: string,
  transitions: TransitionMap,
  from: string,
  to: string,
): void {
  const allowed = transitions[from]
  if (allowed === undefined) {
    throw new Error(`Status desconhecido para ${entity}: "${from}"`)
  }
  if (!allowed.includes(to)) {
    throw new Error(
      allowed.length === 0
        ? `${entity} em status "${from}" é terminal e não pode ser alterado`
        : `Transição inválida para ${entity}: "${from}" → "${to}". Permitido: ${allowed.join(', ')}`,
    )
  }
}
