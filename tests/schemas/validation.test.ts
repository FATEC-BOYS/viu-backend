import { describe, it, expect } from 'vitest'
import {
  CreateUsuarioRequestSchema,
  UpdateUsuarioRequestSchema,
  LoginRequestSchema,
  CreateProjetoRequestSchema,
  UpdateProjetoRequestSchema,
  CreateArteRequestSchema,
  CreateFeedbackRequestSchema,
  CreateAprovacaoRequestSchema,
  PaginationSchema,
  IdParamSchema,
} from '../../src/schemas/validation.js'

describe('CreateUsuarioRequestSchema', () => {
  it('deve validar dados corretos', () => {
    const data = {
      email: 'test@example.com',
      senha: '123456',
      nome: 'Test User',
      tipo: 'DESIGNER' as const,
    }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('deve rejeitar email inválido', () => {
    const data = { email: 'invalid', senha: '123456', nome: 'Test', tipo: 'DESIGNER' }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar senha curta', () => {
    const data = { email: 'a@b.com', senha: '12', nome: 'Test', tipo: 'DESIGNER' }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar nome curto', () => {
    const data = { email: 'a@b.com', senha: '123456', nome: 'T', tipo: 'DESIGNER' }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('deve rejeitar tipo inválido', () => {
    const data = { email: 'a@b.com', senha: '123456', nome: 'Test', tipo: 'ADMIN' }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('deve aceitar campo telefone opcional', () => {
    const data = {
      email: 'test@example.com', senha: '123456', nome: 'Test',
      tipo: 'CLIENTE' as const, telefone: '11999999999',
    }
    const result = CreateUsuarioRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('UpdateUsuarioRequestSchema', () => {
  it('deve validar atualização parcial', () => {
    const result = UpdateUsuarioRequestSchema.safeParse({ nome: 'Novo Nome' })
    expect(result.success).toBe(true)
  })

  it('deve rejeitar objeto vazio', () => {
    const result = UpdateUsuarioRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('LoginRequestSchema', () => {
  it('deve validar login correto', () => {
    const result = LoginRequestSchema.safeParse({ email: 'a@b.com', senha: '123' })
    expect(result.success).toBe(true)
  })

  it('deve rejeitar sem senha', () => {
    const result = LoginRequestSchema.safeParse({ email: 'a@b.com', senha: '' })
    expect(result.success).toBe(false)
  })
})

describe('CreateProjetoRequestSchema', () => {
  it('deve validar projeto com campos obrigatórios', () => {
    const data = {
      nome: 'Projeto X',
      clienteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    }
    const result = CreateProjetoRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('deve rejeitar nome curto', () => {
    const data = { nome: 'P', clienteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }
    const result = CreateProjetoRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('deve aplicar status default EM_ANDAMENTO', () => {
    const data = { nome: 'Projeto', clienteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }
    const result = CreateProjetoRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('EM_ANDAMENTO')
    }
  })
})

describe('UpdateProjetoRequestSchema', () => {
  it('deve rejeitar objeto vazio', () => {
    const result = UpdateProjetoRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('deve aceitar status válido', () => {
    const result = UpdateProjetoRequestSchema.safeParse({ status: 'CONCLUIDO' })
    expect(result.success).toBe(true)
  })
})

describe('CreateArteRequestSchema', () => {
  it('deve validar arte com campos obrigatórios', () => {
    const data = {
      nome: 'Logo v1',
      tipo: 'IMAGEM' as const,
      projetoId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    }
    const result = CreateArteRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('deve rejeitar tipo inválido', () => {
    const data = { nome: 'Logo', tipo: 'INVALIDO', projetoId: 'clxxx' }
    const result = CreateArteRequestSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

describe('CreateFeedbackRequestSchema', () => {
  it('deve validar feedback de texto', () => {
    const data = {
      conteudo: 'Bom trabalho',
      arteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    }
    const result = CreateFeedbackRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('deve aceitar coordenadas posicionais', () => {
    const data = {
      conteudo: 'Ajustar aqui',
      tipo: 'POSICIONAL' as const,
      arteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
      posicaoX: 100.5,
      posicaoY: 200.3,
    }
    const result = CreateFeedbackRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('CreateAprovacaoRequestSchema', () => {
  it('deve validar aprovação', () => {
    const data = {
      arteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
      status: 'APROVADO' as const,
    }
    const result = CreateAprovacaoRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('deve aplicar status default PENDENTE', () => {
    const data = { arteId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' }
    const result = CreateAprovacaoRequestSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('PENDENTE')
    }
  })
})

describe('PaginationSchema', () => {
  it('deve aplicar defaults', () => {
    const result = PaginationSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(10)
    }
  })

  it('deve rejeitar limit acima de 100', () => {
    const result = PaginationSchema.safeParse({ page: 1, limit: 200 })
    expect(result.success).toBe(false)
  })
})

describe('IdParamSchema', () => {
  it('deve validar CUID', () => {
    const result = IdParamSchema.safeParse({ id: 'clxxxxxxxxxxxxxxxxxxxxxxxxx' })
    expect(result.success).toBe(true)
  })

  it('deve rejeitar string vazia', () => {
    const result = IdParamSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })
})
