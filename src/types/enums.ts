// 📊 Enums Constants - Para validação e tipagem
// Mantém a funcionalidade dos enums mesmo no SQLite

// 👤 Tipos de Usuário
export const TipoUsuario = {
  DESIGNER: 'DESIGNER',
  CLIENTE: 'CLIENTE',
  ADMIN: 'ADMIN',
} as const;

export type TipoUsuario = typeof TipoUsuario[keyof typeof TipoUsuario];

// 📁 Status do Projeto
export const StatusProjeto = {
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  PAUSADO: 'PAUSADO',
  CONCLUIDO: 'CONCLUIDO',
  CANCELADO: 'CANCELADO',
} as const;

export type StatusProjeto = typeof StatusProjeto[keyof typeof StatusProjeto];

// 🎨 Tipos de Arte
export const TipoArte = {
  IMAGEM: 'IMAGEM',
  VIDEO: 'VIDEO',
  DOCUMENTO: 'DOCUMENTO',
  AUDIO: 'AUDIO',
  OUTRO: 'OUTRO',
} as const;

export type TipoArte = typeof TipoArte[keyof typeof TipoArte];

/**
 * Status da Arte.
 *
 * `REVISAO` saiu daqui. Ele nunca foi um estado de verdade: `ARTE_TRANSITIONS`
 * não o tinha como chave nem como destino, então nada podia entrar nele por
 * caminho legítimo e — pior — nada podia sair. Uma arte que chegasse lá (a
 * seed colocava uma, e `createArte` aceita status direto) travava de vez, com
 * `assertValidTransition` respondendo "Status desconhecido para Arte" a
 * qualquer tentativa de mexer. A tela, enquanto isso, oferecia "Em revisão"
 * num select e levava 400 sempre.
 *
 * Revisão não precisava de estado próprio: é `REJEITADO → EM_ANALISE` com uma
 * versão nova, que é o caminho que a máquina de estados já permite.
 */
export const StatusArte = {
  EM_ANALISE: 'EM_ANALISE',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO',
} as const;

export type StatusArte = typeof StatusArte[keyof typeof StatusArte];

// 💬 Tipos de Feedback
export const TipoFeedback = {
  TEXTO: 'TEXTO',
  AUDIO: 'AUDIO',
  POSICIONAL: 'POSICIONAL',
} as const;

export type TipoFeedback = typeof TipoFeedback[keyof typeof TipoFeedback];

// ✅ Status de Aprovação
export const StatusAprovacao = {
  PENDENTE: 'PENDENTE',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO',
} as const;

export type StatusAprovacao = typeof StatusAprovacao[keyof typeof StatusAprovacao];

// 📋 Status da Tarefa
export const StatusTarefa = {
  PENDENTE: 'PENDENTE',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
} as const;

export type StatusTarefa = typeof StatusTarefa[keyof typeof StatusTarefa];

// 📋 Prioridade
export const Prioridade = {
  BAIXA: 'BAIXA',
  MEDIA: 'MEDIA',
  ALTA: 'ALTA',
  URGENTE: 'URGENTE',
} as const;

export type Prioridade = typeof Prioridade[keyof typeof Prioridade];

// 🔔 Tipos de Notificação
export const TipoNotificacao = {
  NOVO_PROJETO: 'NOVO_PROJETO',
  NOVA_ARTE: 'NOVA_ARTE',
  NOVO_FEEDBACK: 'NOVO_FEEDBACK',
  APROVACAO: 'APROVACAO',
  PRAZO: 'PRAZO',
  SISTEMA: 'SISTEMA',
} as const;

export type TipoNotificacao = typeof TipoNotificacao[keyof typeof TipoNotificacao];

// 🔔 Canais de Notificação
export const CanalNotificacao = {
  SISTEMA: 'SISTEMA',
  EMAIL: 'EMAIL',
  PUSH: 'PUSH',
  SMS: 'SMS',
} as const;

export type CanalNotificacao = typeof CanalNotificacao[keyof typeof CanalNotificacao];

// 🔍 Arrays para validação
export const TIPOS_USUARIO = Object.values(TipoUsuario);
export const STATUS_PROJETO = Object.values(StatusProjeto);
export const TIPOS_ARTE = Object.values(TipoArte);
export const STATUS_ARTE = Object.values(StatusArte);
export const TIPOS_FEEDBACK = Object.values(TipoFeedback);
export const STATUS_APROVACAO = Object.values(StatusAprovacao);
export const STATUS_TAREFA = Object.values(StatusTarefa);
export const PRIORIDADES = Object.values(Prioridade);
export const TIPOS_NOTIFICACAO = Object.values(TipoNotificacao);
export const CANAIS_NOTIFICACAO = Object.values(CanalNotificacao);

// 🛡️ Funções de validação
export const isValidTipoUsuario = (tipo: string): tipo is TipoUsuario => 
  TIPOS_USUARIO.includes(tipo as TipoUsuario);

export const isValidStatusProjeto = (status: string): status is StatusProjeto => 
  STATUS_PROJETO.includes(status as StatusProjeto);

export const isValidTipoArte = (tipo: string): tipo is TipoArte => 
  TIPOS_ARTE.includes(tipo as TipoArte);

export const isValidStatusArte = (status: string): status is StatusArte => 
  STATUS_ARTE.includes(status as StatusArte);

export const isValidTipoFeedback = (tipo: string): tipo is TipoFeedback => 
  TIPOS_FEEDBACK.includes(tipo as TipoFeedback);

export const isValidStatusAprovacao = (status: string): status is StatusAprovacao => 
  STATUS_APROVACAO.includes(status as StatusAprovacao);

export const isValidStatusTarefa = (status: string): status is StatusTarefa => 
  STATUS_TAREFA.includes(status as StatusTarefa);

export const isValidPrioridade = (prioridade: string): prioridade is Prioridade => 
  PRIORIDADES.includes(prioridade as Prioridade);

export const isValidTipoNotificacao = (tipo: string): tipo is TipoNotificacao => 
  TIPOS_NOTIFICACAO.includes(tipo as TipoNotificacao);

export const isValidCanalNotificacao = (canal: string): canal is CanalNotificacao => 
  CANAIS_NOTIFICACAO.includes(canal as CanalNotificacao);