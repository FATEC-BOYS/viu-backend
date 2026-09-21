/**
 * Schemas de validação usando Zod para o backend
 */

import { z } from 'zod';
import {
  cepValido,
  cnpjValido,
  cpfValido,
  soDigitos,
  UNIDADES_FEDERATIVAS,
} from '../utils/documentos.js';

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

/**
 * O designer apontando quem é o cliente do projeto.
 *
 * Sem `senha` — o backend gera a temporária quando precisa criar a conta, e
 * quem cadastra não escolhe credencial de outra pessoa. Sem `tipo` — a rota
 * só resolve cliente, então deixar o campo aberto seria oferecer uma escolha
 * que não existe.
 */
export const ResolverClienteRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().optional(),
});

export const CreateUsuarioRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: strongPasswordSchema,
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  telefone: z.string().optional(),
  tipo: z.enum(['DESIGNER', 'CLIENTE'], {
    required_error: 'Tipo deve ser DESIGNER ou CLIENTE'
  }),
  /*
   * O aceite dos termos da plataforma. Opcional AQUI e obrigatório na porta
   * pública, por `exigirAceiteDosTermos`.
   *
   * O motivo de não ser obrigatório no schema: ele também valida `POST
   * /usuarios`, que é o designer cadastrando o cliente dele pelo wizard. O
   * cliente não está na frente da tela para aceitar nada, e exigir aqui
   * faria o designer aceitar os termos EM NOME DE OUTRA PESSOA — que é pior
   * do que não ter aceite, porque pareceria um.
   */
  aceiteTermos: z.boolean().optional(),
});

export const UpdateUsuarioRequestSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  telefone: z.string().optional(),
  avatar: z.string().optional(),
  // "ativo" e "tipo" são campos administrativos — use endpoints dedicados
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

export const LoginRequestSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email('Email inválido'),
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(64, 'Token inválido').max(64, 'Token inválido'),
  password: strongPasswordSchema,
});

export const ResendVerificationSchema = z.object({
  email: z.string().email('Email inválido'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export const TwoFactorLoginSchema = z.object({
  userId: z.string().min(1, 'userId é obrigatório'),
  code: z.string().min(6).max(10),
});

// ===== SCHEMAS DE PROJETO =====

// Aceita tanto data pura vinda de <input type="date"> ("2026-08-20") quanto ISO
// completo. O .datetime() do zod rejeitava a primeira, que é o que a UI envia.
const dataFlexivel = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data de prazo inválida')
  // o Prisma exige ISO-8601 completo, então normaliza aqui — o middleware
  // sobrescreve o body com a saída do parse
  .transform((v) => new Date(v))

export const CreateProjetoRequestSchema = z.object({
  nome: z.string().min(2, 'Nome do projeto deve ter pelo menos 2 caracteres'),
  // colunas nullable no schema Prisma — a UI envia null quando o campo fica vazio
  descricao: z.string().nullable().optional(),
  clienteId: z.string().cuid('ID do cliente inválido'),
  designerId: z.string().cuid('ID do designer inválido').optional(),
  // 0 é válido: projeto sem orçamento definido ainda
  orcamento: z.number().int().nonnegative('Orçamento não pode ser negativo').optional(),
  prazo: dataFlexivel.nullable().optional(),
  // status omitted — always starts as EM_ANDAMENTO; callers cannot pre-set it
  // equipeId is organizational only and does not grant project access
  equipeId: z.string().cuid('ID da equipe inválido').optional(),
});

export const UpdateProjetoRequestSchema = z.object({
  nome: z.string().min(2, 'Nome do projeto deve ter pelo menos 2 caracteres').optional(),
  descricao: z.string().nullable().optional(),
  status: z.enum(['EM_ANDAMENTO', 'CONCLUIDO', 'PAUSADO', 'CANCELADO']).optional(),
  orcamento: z.number().int().nonnegative('Orçamento não pode ser negativo').optional(),
  prazo: dataFlexivel.nullable().optional(),
  // equipeId is organizational only and does not grant project access; null removes the link
  equipeId: z.string().cuid('ID da equipe inválido').nullable().optional(),
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
  parentId: z.string().cuid('ID do feedback pai inválido').optional(),
});

// ===== SCHEMAS DE TAREFA =====

export const CreateTarefaRequestSchema = z.object({
  titulo: z.string().min(1, 'Título da tarefa é obrigatório'),
  descricao: z.string().optional(),
  status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).default('PENDENTE'),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).default('MEDIA'),
  projetoId: z.string().cuid('ID do projeto inválido'),
  responsavelId: z.string().cuid('ID do responsável inválido').optional(),
  prazo: z.string().datetime('Data de prazo inválida').optional(),
});

export const UpdateTarefaRequestSchema = z.object({
  titulo: z.string().min(1, 'Título da tarefa é obrigatório').optional(),
  descricao: z.string().optional(),
  status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']).optional(),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']).optional(),
  responsavelId: z.string().cuid('ID do responsável inválido').optional(),
  prazo: z.string().datetime('Data de prazo inválida').optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

// ===== SCHEMAS DE APROVAÇÃO =====

export const CreateAprovacaoRequestSchema = z.object({
  status: z.enum(['PENDENTE', 'APROVADO', 'REJEITADO']).default('PENDENTE'),
  comentario: z.string().optional(),
  arteId: z.string().cuid('ID da arte inválido'),
  versaoNumero: z.number().int().positive().optional(),
});

// Solicitar não carrega decisão: só diz qual entrega vai ser julgada. Sem
// versão informada, o service usa a versão corrente da arte.
export const SolicitarAprovacaoRequestSchema = z.object({
  versaoNumero: z.number().int().positive().optional(),
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
  // "secret" e "backupCodes" não são aceitos do cliente — o servidor gerencia esses dados
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

export type ResolverClienteRequest = z.infer<typeof ResolverClienteRequestSchema>;
export type CreateUsuarioRequest = z.infer<typeof CreateUsuarioRequestSchema>;
export type UpdateUsuarioRequest = z.infer<typeof UpdateUsuarioRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type CreateProjetoRequest = z.infer<typeof CreateProjetoRequestSchema>;
export type UpdateProjetoRequest = z.infer<typeof UpdateProjetoRequestSchema>;
export type CreateArteRequest = z.infer<typeof CreateArteRequestSchema>;
export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequestSchema>;
export type CreateAprovacaoRequest = z.infer<typeof CreateAprovacaoRequestSchema>;
export type CreateTarefaRequest = z.infer<typeof CreateTarefaRequestSchema>;
export type UpdateTarefaRequest = z.infer<typeof UpdateTarefaRequestSchema>;

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
// ===== SCHEMAS FINANCEIROS =====

export const CriarFaturaSchema = z.object({
  descricao: z.string().max(500).optional(),
  dataVencimento: z.string().datetime('Data de vencimento inválida').optional(),
})

export const PagarFaturaPixSchema = z.object({
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve conter exatamente 11 dígitos numéricos'),
})

export const SolicitarSaqueSchema = z.object({
  chavePixId: z.string().min(1, 'chavePixId é obrigatório'),
  valor: z.number().int('Valor deve ser inteiro em centavos').positive('Valor deve ser positivo'),
})

/*
 * A chave precisa ter a cara do tipo que ela diz ser.
 *
 * `chave` era `z.string().min(1).max(256)`, então `tipo: 'CPF'` com
 * `chave: 'banana'` entrava — conferido contra o servidor: os quatro tipos
 * aceitavam lixo. Isto é o fim de um caminho de dinheiro: o designer cadastra,
 * pede o saque, e a transferência falha lá na frente, quando ele já está
 * esperando o dinheiro cair.
 *
 * As regras são as do próprio PIX, não invenção nossa. O CPF confere os
 * dígitos verificadores porque onze dígitos quaisquer não são um CPF — e é
 * justamente o erro de digitação que se quer pegar aqui.
 */
/*
 * `cpfValido` mora em `utils/documentos` desde que os dados fiscais passaram a
 * precisar do mesmo conferidor. Duas cópias do algoritmo seriam duas verdades
 * sobre o que é um CPF válido, com a divergência aparecendo numa nota recusada
 * pela prefeitura.
 */
const SO_DIGITOS = soDigitos

/** Celular brasileiro: DDD (11–99) + 9 + oito dígitos, com ou sem +55. */
function telefoneValido(bruto: string): boolean {
  const n = SO_DIGITOS(bruto).replace(/^55/, '')
  return /^[1-9][1-9]9\d{8}$/.test(n)
}

/** Chave aleatória do PIX é um UUID — 32 hexadecimais, com ou sem hífens. */
function aleatoriaValida(bruto: string): boolean {
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(bruto.trim())
}

const MENSAGEM_POR_TIPO: Record<'CPF' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA', string> = {
  CPF: 'CPF inválido',
  EMAIL: 'E-mail inválido',
  TELEFONE: 'Telefone inválido — use DDD + celular, como 11987654321',
  ALEATORIA: 'Chave aleatória inválida — ela tem o formato de um UUID',
}

export const CadastrarChavePixSchema = z
  .object({
    tipo: z.enum(['CPF', 'EMAIL', 'TELEFONE', 'ALEATORIA'], {
      errorMap: () => ({ message: 'Tipo deve ser CPF, EMAIL, TELEFONE ou ALEATORIA' }),
    }),
    chave: z.string().trim().min(1, 'Chave PIX é obrigatória').max(256),
    titular: z.string().trim().min(1, 'Nome do titular é obrigatório').max(256),
  })
  .superRefine((dados, ctx) => {
    // Indexado pelo tipo do enum, não por `string`: assim o compilador garante
    // que todo tipo aceito tem um conferidor, e um tipo novo sem regra não
    // passa batido.
    const confere: Record<typeof dados.tipo, (v: string) => boolean> = {
      CPF: cpfValido,
      EMAIL: (v) => z.string().email().safeParse(v).success,
      TELEFONE: telefoneValido,
      ALEATORIA: aleatoriaValida,
    }

    if (!confere[dados.tipo](dados.chave)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chave'],
        message: MENSAGEM_POR_TIPO[dados.tipo],
      })
    }
  })

// ===== SCHEMAS DE EQUIPE =====

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const CriarEquipeSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  slug: z.string()
    .min(2)
    .max(50)
    .regex(SLUG_REGEX, 'Slug deve conter apenas letras minúsculas, números e hífens'),
})

export const AtualizarEquipeSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(50).regex(SLUG_REGEX, 'Slug inválido').optional(),
})

export const AdicionarMembroSchema = z.object({
  usuarioId: z.string().cuid('ID de usuário inválido'),
  papel: z.enum(['LIDER', 'DESIGNER', 'REVISOR', 'CLIENTE'], {
    errorMap: () => ({ message: 'Papel deve ser LIDER, DESIGNER, REVISOR ou CLIENTE' }),
  }),
})

export const AtualizarPapelSchema = z.object({
  papel: z.enum(['LIDER', 'DESIGNER', 'REVISOR', 'CLIENTE'], {
    errorMap: () => ({ message: 'Papel deve ser LIDER, DESIGNER, REVISOR ou CLIENTE' }),
  }),
})

export const VincularProjetoSchema = z.object({
  projetoId: z.string().cuid('ID de projeto inválido'),
})

/**
 * Plano de assinatura.
 *
 * `createPlanoHandler` mandava `request.body as any` direto para o Prisma. O
 * campo que mais assusta é `taxaPlataforma`: é uma fração (0.10 = 10%) e vai
 * crua para `faturaService`, que calcula quanto o designer recebe. Digitar 10
 * em vez de 0.10 faria a plataforma reter 1000% — e o valor líquido do
 * designer ficaria negativo, em toda fatura nova.
 */
export const PlanoSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  tipo: z.enum(['DESIGNER', 'CLIENTE'], {
    required_error: 'Tipo deve ser DESIGNER ou CLIENTE',
  }),
  // Centavos, como todo dinheiro no schema. 0 = plano gratuito, que ativa na
  // hora sem passar pelo Mercado Pago.
  precoMensal: z.number().int('Preço deve ser em centavos').min(0, 'Preço não pode ser negativo'),
  precoAnual: z.number().int('Preço deve ser em centavos').min(0).nullable().optional(),
  taxaPlataforma: z
    .number()
    .min(0, 'A taxa não pode ser negativa')
    .max(1, 'A taxa é uma fração: 0,10 significa 10%')
    .optional(),
  limitesProjetos: z.number().int().min(0).nullable().optional(),
  limitesArtes: z.number().int().min(0).nullable().optional(),
  limitesStorageMb: z.number().int().min(0).nullable().optional(),
  descricao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
})

/** Na edição tudo é opcional, mas mandar um corpo vazio não é uma edição. */
export const PlanoUpdateSchema = PlanoSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Pelo menos um campo deve ser fornecido para atualização' },
)

// ===== TERMOS DO PROJETO (anexo de revisão, cláusulas 3.1, 4.1 e 7.2) =====

/**
 * Os termos comerciais que o anexo renderiza.
 *
 * Tudo é opcional porque a tela salva aos poucos — combinar prazo hoje e
 * licença amanhã é o uso normal. O que não pode é salvar uma combinação
 * incoerente, e é isso que os dois `superRefine` abaixo impedem.
 *
 * Note que "opcional" aqui não é o mesmo que "pode ficar assim para sempre":
 * `termosCompletos()` é quem decide se está pronto para gerar contrato, e ela
 * exige todos. Um valida a forma, a outra a suficiência.
 */
export const TermosProjetoSchema = z
  .object({
    // 3.1 — rodadas incluídas. 0 é válido: "nenhuma revisão inclusa" é um
    // acordo possível, e diferente de não ter combinado.
    rodadasIncluidas: z.number().int().min(0, 'Não pode ser negativo').max(99).nullable().optional(),

    // 4.1 — dias úteis. Sem efeito automático: a 4.2 ficou sem aprovação
    // tácita, então este número é combinado e exibido, nunca gatilho.
    prazoRevisaoDiasUteis: z.number().int().min(1, 'Mínimo de 1 dia').max(365).nullable().optional(),

    licencaFinalidade: z.string().trim().min(3, 'Descreva onde a peça pode ser usada').max(500).nullable().optional(),
    licencaTerritorio: z.string().trim().min(2, 'Informe o território').max(200).nullable().optional(),

    licencaPrazo: z.enum(['INDETERMINADO', 'ATE_DATA']).nullable().optional(),
    licencaPrazoAte: z.string().datetime({ offset: true }).nullable().optional(),

    exclusividade: z.boolean().nullable().optional(),
    exclusividadeAte: z.string().datetime({ offset: true }).nullable().optional(),

    arquivosFonte: z
      .enum(['NAO_INCLUSOS', 'INCLUSOS_APOS_QUITACAO', 'TAXA_EXTRA'])
      .nullable()
      .optional(),
  })
  .superRefine((dados, ctx) => {
    // Prazo "até uma data" sem a data é a cláusula 7.2 dizendo "vale até ___".
    if (dados.licencaPrazo === 'ATE_DATA' && !dados.licencaPrazoAte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['licencaPrazoAte'],
        message: 'Informe até quando a licença vale',
      })
    }
    // E a data sem o prazo deixaria a interface mostrando um valor que o
    // contrato não menciona.
    if (dados.licencaPrazo === 'INDETERMINADO' && dados.licencaPrazoAte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['licencaPrazoAte'],
        message: 'Licença por prazo indeterminado não tem data de fim',
      })
    }
    if (dados.exclusividade === true && !dados.exclusividadeAte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusividadeAte'],
        message: 'Exclusividade precisa de prazo — exclusividade eterna é cessão, não licença',
      })
    }
    if (dados.exclusividade !== true && dados.exclusividadeAte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusividadeAte'],
        message: 'Só faz sentido com exclusividade marcada',
      })
    }
  })


// ===== DADOS FISCAIS =====

/**
 * O que uma nota fiscal precisa de quem a recebe.
 *
 * Nada aqui é enfeite: sem endereço completo e sem documento conferido, o
 * emissor recusa a nota — e a recusa chega depois, fora do produto, quando
 * alguém já está esperando o documento. Validar na entrada é o que mantém o
 * erro perto de quem consegue corrigi-lo.
 *
 * O documento é guardado só com dígitos. A pontuação que a pessoa digita é
 * assunto de quem exibe, e guardar as duas formas seria guardar duas verdades
 * sobre o mesmo CNPJ.
 */
export const DadosFiscaisSchema = z
  .object({
    tipoPessoa: z.enum(['FISICA', 'JURIDICA'], {
      errorMap: () => ({ message: 'Tipo de pessoa deve ser FISICA ou JURIDICA' }),
    }),
    documento: z.string().trim().min(1, 'CPF ou CNPJ é obrigatório'),
    razaoSocial: z
      .string()
      .trim()
      .min(2, 'Informe a razão social (ou seu nome completo)')
      .max(256),
    nomeFantasia: z.string().trim().max(256).nullable().optional(),
    inscricaoMunicipal: z.string().trim().max(32).nullable().optional(),

    cep: z.string().trim().min(1, 'CEP é obrigatório'),
    logradouro: z.string().trim().min(2, 'Logradouro é obrigatório').max(256),
    numero: z.string().trim().min(1, 'Número é obrigatório').max(16),
    complemento: z.string().trim().max(128).nullable().optional(),
    bairro: z.string().trim().min(2, 'Bairro é obrigatório').max(128),
    cidade: z.string().trim().min(2, 'Cidade é obrigatória').max(128),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => (UNIDADES_FEDERATIVAS as readonly string[]).includes(v), {
        message: 'UF inválida',
      }),
  })
  .superRefine((dados, ctx) => {
    /*
     * O documento tem que combinar com o tipo declarado.
     *
     * Aceitar um CPF em conta marcada como jurídica deixaria a nota sair com
     * tomador de um tipo e documento de outro — e quem descobre é a prefeitura,
     * rejeitando. O par é conferido aqui porque é aqui que ele ainda pode ser
     * corrigido por quem digitou.
     */
    const ehValido = dados.tipoPessoa === 'FISICA' ? cpfValido : cnpjValido
    if (!ehValido(dados.documento)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documento'],
        message:
          dados.tipoPessoa === 'FISICA'
            ? 'CPF inválido'
            : 'CNPJ inválido',
      })
    }

    if (!cepValido(dados.cep)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cep'],
        message: 'CEP inválido — são oito dígitos',
      })
    }
  })
  .transform((dados) => ({
    ...dados,
    documento: soDigitos(dados.documento),
    cep: soDigitos(dados.cep),
  }))
