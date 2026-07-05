/**
 * Permissões nomeadas do sistema (RBAC por ação).
 *
 * Cada permissão representa uma ação de negócio — não um endpoint.
 * A herança funciona em dois níveis:
 *   1. Tipo global do usuário (ADMIN, DESIGNER, CLIENTE)
 *   2. Papel na equipe (LIDER, DESIGNER, REVISOR, CLIENTE) — acumulado sobre o nível global
 *
 * Fase atual (A): permissões definidas em código, verificadas em runtime.
 * Fase B: admin UI para configurar permissões por papel sem deploy.
 */

export const PERMISSOES = {
  CRIAR_PROJETO:     'criar_projeto',
  CRIAR_ARTE:        'criar_arte',
  EDITAR_ARTE:       'editar_arte',
  APROVAR_ARTE:      'aprovar_arte',
  EDITAR_FINANCEIRO: 'editar_financeiro',
  VER_FINANCEIRO:    'ver_financeiro',
  CONVIDAR_MEMBRO:   'convidar_membro',
  GERENCIAR_EQUIPE:  'gerenciar_equipe',
  CRIAR_FEEDBACK:    'criar_feedback',
  RESOLVER_THREAD:   'resolver_thread',
} as const

export type Permissao = (typeof PERMISSOES)[keyof typeof PERMISSOES]

// Permissions granted by global usuario.tipo
export const TIPO_PERMISSIONS: Record<string, Permissao[]> = {
  ADMIN: Object.values(PERMISSOES) as Permissao[],

  DESIGNER: [
    PERMISSOES.CRIAR_PROJETO,
    PERMISSOES.CRIAR_ARTE,
    PERMISSOES.EDITAR_ARTE,
    PERMISSOES.EDITAR_FINANCEIRO,
    PERMISSOES.VER_FINANCEIRO,
    PERMISSOES.CRIAR_FEEDBACK,
    PERMISSOES.RESOLVER_THREAD,
    // convidar_membro: só via papel LIDER na equipe, não globalmente
  ],

  CLIENTE: [
    PERMISSOES.APROVAR_ARTE,
    PERMISSOES.VER_FINANCEIRO,
    PERMISSOES.CRIAR_FEEDBACK,
    PERMISSOES.RESOLVER_THREAD,
  ],
}

// Extra permissions granted by equipe papel, stacked on top of TIPO_PERMISSIONS.
// Only applied when a EquipeMembro row exists for the user in the relevant equipe.
export const EQUIPE_PAPEL_PERMISSIONS: Record<string, Permissao[]> = {
  LIDER: [
    PERMISSOES.CONVIDAR_MEMBRO,
    PERMISSOES.GERENCIAR_EQUIPE,
    PERMISSOES.CRIAR_PROJETO,
    PERMISSOES.CRIAR_ARTE,
    PERMISSOES.EDITAR_ARTE,
    PERMISSOES.CRIAR_FEEDBACK,
    PERMISSOES.RESOLVER_THREAD,
  ],
  DESIGNER: [
    PERMISSOES.CRIAR_ARTE,
    PERMISSOES.EDITAR_ARTE,
    PERMISSOES.CRIAR_FEEDBACK,
    PERMISSOES.RESOLVER_THREAD,
  ],
  REVISOR: [
    PERMISSOES.APROVAR_ARTE,
    PERMISSOES.CRIAR_FEEDBACK,
    PERMISSOES.RESOLVER_THREAD,
  ],
  CLIENTE: [
    PERMISSOES.APROVAR_ARTE,
    PERMISSOES.CRIAR_FEEDBACK,
  ],
}
