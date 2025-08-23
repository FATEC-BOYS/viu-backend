/**
 * Schemas de validação usando Zod para o backend
 */

import { z } from 'zod';

// ===== SCHEMAS DE USUÁRIO =====

export const CreateUsuarioRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
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
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

export const IdParamSchema = z.object({
  id: z.string().cuid('ID inválido'),
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