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

/**
 * Cláusula 7.2 do anexo de revisão — até quando a licença de uso vale.
 *
 * Dois valores e não uma data anulável: com data só, `null` teria que
 * significar "indeterminado" e "ninguém respondeu ainda" ao mesmo tempo, e é o
 * segundo que o aviso de termos incompletos precisa enxergar.
 */
export const LicencaPrazo = {
  INDETERMINADO: 'INDETERMINADO',
  ATE_DATA: 'ATE_DATA',
} as const;

export type LicencaPrazo = typeof LicencaPrazo[keyof typeof LicencaPrazo];

/** Cláusula 7.2 — o destino dos arquivos editáveis, que é a briga mais comum. */
export const ArquivosFonte = {
  NAO_INCLUSOS: 'NAO_INCLUSOS',
  INCLUSOS_APOS_QUITACAO: 'INCLUSOS_APOS_QUITACAO',
  TAXA_EXTRA: 'TAXA_EXTRA',
} as const;

export type ArquivosFonte = typeof ArquivosFonte[keyof typeof ArquivosFonte];

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

/*
 * 🔔 Tipos de Notificação
 *
 * Esta lista precisa ser exatamente o que os serviços disparam. Ela já esteve
 * errada: declarava NOVO_PROJETO, NOVA_ARTE, APROVACAO e PRAZO — que nenhum
 * `dispatch` jamais emitiu — e não declarava dez tipos que existiam de fato.
 * Deu para divergir porque `dispatch` recebia `tipo: string`, então o
 * compilador não tinha o que conferir; o seed escrevia o vocabulário da lista
 * e a tela de /notificacoes foi desenhada a partir dela, de modo que filtro e
 * rótulo combinavam com o seed e com mais nada.
 *
 * `dispatch` agora recebe `TipoNotificacao`. Tipo novo sem entrada aqui não
 * compila, e é assim que a divergência não volta.
 */
export const TipoNotificacao = {
  APROVACAO_SOLICITADA: 'APROVACAO_SOLICITADA',
  LEMBRETE_APROVACAO: 'LEMBRETE_APROVACAO',
  ARTE_APROVADA: 'ARTE_APROVADA',
  ARTE_REJEITADA: 'ARTE_REJEITADA',
  NOVO_FEEDBACK: 'NOVO_FEEDBACK',
  FATURA_GERADA: 'FATURA_GERADA',
  PAGAMENTO_CONFIRMADO: 'PAGAMENTO_CONFIRMADO',
  ESTORNO: 'ESTORNO',
  CLIENTE_RECUSOU_CADASTRO: 'CLIENTE_RECUSOU_CADASTRO',
  ASSINATURA_RENOVADA: 'ASSINATURA_RENOVADA',
  ASSINATURA_CANCELADA: 'ASSINATURA_CANCELADA',
  ASSINATURA_PAUSADA: 'ASSINATURA_PAUSADA',
  SISTEMA: 'SISTEMA',
} as const;

export type TipoNotificacao = typeof TipoNotificacao[keyof typeof TipoNotificacao];

/*
 * O nome que a pessoa lê.
 *
 * Fica aqui, coladinho na união, e não na tela: o rótulo precisa nascer junto
 * com o tipo, senão tipo novo aparece na caixa de entrada escrito
 * `APROVACAO_SOLICITADA` — que foi o que aconteceu com dez dos doze. O
 * `Record` completo obriga o par: declarar o tipo sem rótulo não compila.
 */
export const ROTULO_NOTIFICACAO: Record<TipoNotificacao, string> = {
  APROVACAO_SOLICITADA: 'Aguardando sua aprovação',
  LEMBRETE_APROVACAO: 'Lembrete de aprovação',
  ARTE_APROVADA: 'Arte aprovada',
  ARTE_REJEITADA: 'Arte recusada',
  NOVO_FEEDBACK: 'Novo feedback',
  FATURA_GERADA: 'Fatura gerada',
  PAGAMENTO_CONFIRMADO: 'Pagamento confirmado',
  ESTORNO: 'Estorno',
  CLIENTE_RECUSOU_CADASTRO: 'Cliente recusou o cadastro',
  ASSINATURA_RENOVADA: 'Assinatura ativada',
  ASSINATURA_CANCELADA: 'Assinatura cancelada',
  ASSINATURA_PAUSADA: 'Assinatura pausada',
  SISTEMA: 'Sistema',
};

/*
 * A que a notificação se refere — para a linha levar a algum lugar.
 *
 * Sem isto a caixa de entrada avisa e abandona: "'Logo TechStart' aguarda sua
 * aprovação" sem caminho até a arte.
 */
export const EntidadeNotificacao = {
  ARTE: 'ARTE',
  PROJETO: 'PROJETO',
  FATURA: 'FATURA',
  ASSINATURA: 'ASSINATURA',
} as const;

export type EntidadeNotificacao = typeof EntidadeNotificacao[keyof typeof EntidadeNotificacao];

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
export const LICENCA_PRAZOS = Object.values(LicencaPrazo);
export const ARQUIVOS_FONTE = Object.values(ArquivosFonte);
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

export const isValidLicencaPrazo = (valor: string): valor is LicencaPrazo =>
  LICENCA_PRAZOS.includes(valor as LicencaPrazo);

export const isValidArquivosFonte = (valor: string): valor is ArquivosFonte =>
  ARQUIVOS_FONTE.includes(valor as ArquivosFonte);
