/**
 * Schemas de validação usando Zod para o backend
 */

import { z } from 'zod';

// ===== VALIDAÇÃO DE SENHA FORTE =====

// Lista de senhas comuns que devem ser bloqueadas
const commonPasswords = [
  '123456', 'password', '12345678', 'qwerty', '123456789', '12345',
  '1234', '111111', '1234567', 'dragon', '123123', 'baseball',
  'iloveyou', 'trustno1', '1234567890', 'sunshine', 'master',
  'welcome', 'shadow', 'ashley', 'football', 'jesus', 'michael',
  'ninja', 'mustang', 'password1', 'Password1', 'senha123', 'senha',
];

const strongPasswordSchema = z
  .string()
  .min(12, 'Senha deve ter pelo menos 12 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .refine((senha) => /[a-z]/.test(senha), {
    message: 'Senha deve conter pelo menos uma letra minúscula',
  })
  .refine((senha) => /[A-Z]/.test(senha), {
    message: 'Senha deve conter pelo menos uma letra maiúscula',
  })
  .refine((senha) => /[0-9]/.test(senha), {
    message: 'Senha deve conter pelo menos um número',
  })
  .refine((senha) => /[^a-zA-Z0-9]/.test(senha), {
    message: 'Senha deve conter pelo menos um caractere especial (!@#$%^&*)',
  })
  .refine((senha) => !commonPasswords.includes(senha.toLowerCase()), {
    message: 'Esta senha é muito comum e insegura. Escolha uma senha mais forte.',
  })
  .refine((senha) => !/(.)\1{2,}/.test(senha), {
    message: 'Senha não deve conter mais de 2 caracteres repetidos consecutivos',
  });

// ===== SCHEMAS DE USUÁRIO =====

export const CreateUsuarioRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: strongPasswordSchema,
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().optional(),
  tipo: z.enum(['DESIGNER', 'CLIENTE'], {
    required_error: 'Tipo deve ser DESIGNER ou CLIENTE'
  }),
});

export const UpdateUsuarioRequestSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telefone: z.string().optional(),
  avatar: z.string().optional(),
  ativo: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

export const LoginRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});

// ===== SCHEMAS DE PROJETO =====

export const CreateProjetoRequestSchema = z.object({
  nome: z.string().min(2, 'Nome do projeto deve ter pelo menos 2 caracteres'),
  descricao: z.string().optional(),
  clienteId: z.string().cuid('ID do cliente inválido'),
  designerId: z.string().cuid('ID do designer inválido').optional(),
  orcamento: z.number().int().positive('Orçamento deve ser um valor positivo em centavos').optional(),
  prazo: z.string().datetime('Data de prazo inválida').optional(),
  status: z.enum(['EM_ANDAMENTO', 'CONCLUIDO', 'PAUSADO', 'CANCELADO']).default('EM_ANDAMENTO'),
});

export const UpdateProjetoRequestSchema = z.object({
  nome: z.string().min(2, 'Nome do projeto deve ter pelo menos 2 caracteres').optional(),
  descricao: z.string().optional(),
  status: z.enum(['EM_ANDAMENTO', 'CONCLUIDO', 'PAUSADO', 'CANCELADO']).optional(),
  orcamento: z.number().int().positive('Orçamento deve ser um valor positivo em centavos').optional(),
  prazo: z.string().datetime('Data de prazo inválida').optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

// ===== SCHEMAS DE ARTE =====

export const CreateArteRequestSchema = z.object({
  nome: z.string().min(1, 'Nome da arte é obrigatório'),
  descricao: z.string().optional(),
  tipo: z.enum(['IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO']),
  projetoId: z.string().cuid('ID do projeto inválido'),
});

// ===== SCHEMAS DE FEEDBACK =====

export const CreateFeedbackRequestSchema = z.object({
  conteudo: z.string().min(1, 'Conteúdo do feedback é obrigatório'),
  tipo: z.enum(['TEXTO', 'AUDIO', 'POSICIONAL']).default('TEXTO'),
  arteId: z.string().cuid('ID da arte inválido'),
  posicaoX: z.number().optional(),
  posicaoY: z.number().optional(),
});

// ===== SCHEMAS DE APROVAÇÃO =====

export const CreateAprovacaoRequestSchema = z.object({
  status: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO']).default('PENDENTE'),
  comentario: z.string().optional(),
  arteId: z.string().cuid('ID da arte inválido'),
});

// ===== SCHEMAS UTILITÁRIOS =====

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const IdParamSchema = z.object({
  id: z.string().cuid('ID inválido'),
});

// Schema para validar query strings de busca
export const SearchQuerySchema = z.object({
  search: z.string()
    .max(100, 'Termo de busca muito longo')
    .regex(/^[a-zA-Z0-9\s\-_áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]*$/, 'Termo de busca contém caracteres inválidos')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.string().optional(),
  tipo: z.string().optional(),
});

// Schema para validar parâmetros de ID em paths
export const CuidParamSchema = z.object({
  id: z.string()
    .cuid('ID deve ser um CUID válido')
    .min(1, 'ID é obrigatório'),
});

// Schema para validar múltiplos IDs
export const MultipleIdsSchema = z.object({
  ids: z.array(z.string().cuid('Cada ID deve ser um CUID válido'))
    .min(1, 'Pelo menos um ID deve ser fornecido')
    .max(100, 'Máximo de 100 IDs por requisição'),
});

// ===== SCHEMAS DE 2FA =====

export const EnableTwoFactorRequestSchema = z.object({
  code: z.string()
    .length(6, 'Código 2FA deve ter 6 dígitos')
    .regex(/^\d{6}$/, 'Código 2FA deve conter apenas números'),
  secret: z.string()
    .min(16, 'Secret 2FA inválido')
    .max(64, 'Secret 2FA inválido'),
  backupCodes: z.array(z.string().length(10, 'Código de backup inválido'))
    .length(10, 'Devem ser fornecidos exatamente 10 códigos de backup'),
});

export const DisableTwoFactorRequestSchema = z.object({
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const VerifyTwoFactorCodeRequestSchema = z.object({
  userId: z.string().cuid('ID do usuário inválido'),
  code: z.string()
    .min(6, 'Código deve ter pelo menos 6 caracteres')
    .max(10, 'Código deve ter no máximo 10 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'Código deve conter apenas letras e números'),
});

export const RegenerateBackupCodesRequestSchema = z.object({
  password: z.string().min(1, 'Senha é obrigatória'),
});

// ===== SCHEMAS DE AUDIT LOGS & SECURITY =====

export const AuditLogsQuerySchema = z.object({
  usuarioId: z.string().cuid('ID do usuário inválido').optional(),
  action: z.string()
    .max(50, 'Ação muito longa')
    .regex(/^[A-Z_]+$/, 'Ação deve conter apenas letras maiúsculas e underscores')
    .optional(),
  resource: z.string()
    .max(50, 'Recurso muito longo')
    .regex(/^[A-Za-z]+$/, 'Recurso deve conter apenas letras')
    .optional(),
  status: z.enum(['SUCCESS', 'FAILURE'], {
    errorMap: () => ({ message: 'Status deve ser SUCCESS ou FAILURE' })
  }).optional(),
  startDate: z.string().datetime('Data inicial inválida').optional(),
  endDate: z.string().datetime('Data final inválida').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'Data inicial deve ser anterior à data final',
    path: ['startDate'],
  }
);

export const AuditStatsQuerySchema = z.object({
  usuarioId: z.string().cuid('ID do usuário inválido').optional(),
  startDate: z.string().datetime('Data inicial inválida').optional(),
  endDate: z.string().datetime('Data final inválida').optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'Data inicial deve ser anterior à data final',
    path: ['startDate'],
  }
);

export const SecurityEventsQuerySchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], {
    errorMap: () => ({ message: 'Severidade deve ser LOW, MEDIUM, HIGH ou CRITICAL' })
  }).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const SecurityStatsQuerySchema = z.object({
  startDate: z.string().datetime('Data inicial inválida').optional(),
  endDate: z.string().datetime('Data final inválida').optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'Data inicial deve ser anterior à data final',
    path: ['startDate'],
  }
);

export const RecentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const UserIdParamSchema = z.object({
  userId: z.string()
    .cuid('ID do usuário deve ser um CUID válido')
    .min(1, 'ID do usuário é obrigatório'),
});

// ===== TIPOS INFERIDOS =====

export type CreateUsuarioRequest = z.infer<typeof CreateUsuarioRequestSchema>;
export type UpdateUsuarioRequest = z.infer<typeof UpdateUsuarioRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type CreateProjetoRequest = z.infer<typeof CreateProjetoRequestSchema>;
export type UpdateProjetoRequest = z.infer<typeof UpdateProjetoRequestSchema>;
export type CreateArteRequest = z.infer<typeof CreateArteRequestSchema>;
export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequestSchema>;
export type CreateAprovacaoRequest = z.infer<typeof CreateAprovacaoRequestSchema>;

// 2FA Types
export type EnableTwoFactorRequest = z.infer<typeof EnableTwoFactorRequestSchema>;
export type DisableTwoFactorRequest = z.infer<typeof DisableTwoFactorRequestSchema>;
export type VerifyTwoFactorCodeRequest = z.infer<typeof VerifyTwoFactorCodeRequestSchema>;
export type RegenerateBackupCodesRequest = z.infer<typeof RegenerateBackupCodesRequestSchema>;

// Security Types
export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;
export type AuditStatsQuery = z.infer<typeof AuditStatsQuerySchema>;
export type SecurityEventsQuery = z.infer<typeof SecurityEventsQuerySchema>;
export type SecurityStatsQuery = z.infer<typeof SecurityStatsQuerySchema>;
export type RecentActivityQuery = z.infer<typeof RecentActivityQuerySchema>;