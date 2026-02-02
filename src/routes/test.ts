/**
 * 🧪 Rotas de Teste - VIU Shared Integration
 * 
 * Endpoints para testar a integração com a biblioteca viu-shared
 */

import { FastifyInstance } from 'fastify'

// 🎯 IMPORTANDO DO VIU-SHARED - AQUI É A MÁGICA! ✨
import { 
  // Formatadores
  formatCurrency,
  formatPhone,
  formatDate,
  formatFileSize,
  
  // Validadores
  isValidCPF,
  isValidCNPJ,
  isValidEmail,
  isValidPhone,
  
  // Schemas de validação
  CreateUsuarioRequestSchema,
  LoginRequestSchema,
  
  // Tipos
  StatusProjeto,
  TipoUsuario,
  
  // Constantes
  APP_INFO,
  SUPPORTED_FILE_TYPES
} from '../../../viu-shared/dist/index.mjs'

export async function testRoutes(fastify: FastifyInstance) {
  // 🔒 SEGURANÇA: Rotas de teste só disponíveis em desenvolvimento
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    // Em produção, todas as rotas de teste retornam 404
    fastify.all('/test/*', async (request, reply) => {
      return reply.status(404).send({
        message: 'Rota não encontrada',
        success: false,
      })
    })
    return
  }

  /**
   * 💰 Teste de Formatação de Moeda
   */
  fastify.get('/test/currency', async (request, reply) => {
    const valores = [123456, 50000, 999.99, 0, 1234567890]
    
    return {
      message: '💰 Teste de formatação de moeda usando viu-shared',
      results: valores.map(valor => ({
        original: valor,
        formatted: formatCurrency(valor)
      })),
      success: true
    }
  })

  /**
   * 📱 Teste de Formatação de Telefone
   */
  fastify.get('/test/phone', async (request, reply) => {
    const telefones = ['11987654321', '21123456789', '85999887766', '1199999999']
    
    return {
      message: '📱 Teste de formatação de telefone usando viu-shared',
      results: telefones.map(telefone => ({
        original: telefone,
        formatted: formatPhone(telefone)
      })),
      success: true
    }
  })

  /**
   * 📅 Teste de Formatação de Data
   */
  fastify.get('/test/date', async (request, reply) => {
    const agora = new Date()
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const proximoMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    
    return {
      message: '📅 Teste de formatação de data usando viu-shared',
      results: [
        {
          label: 'Agora',
          original: agora.toISOString(),
          formatted: formatDate(agora)
        },
        {
          label: 'Ontem',
          original: ontem.toISOString(),
          formatted: formatDate(ontem)
        },
        {
          label: 'Próximo mês',
          original: proximoMes.toISOString(),
          formatted: formatDate(proximoMes)
        }
      ],
      success: true
    }
  })

  /**
   * ✅ Teste de Validação de CPF
   */
  fastify.get('/test/cpf', async (request, reply) => {
    const cpfs = [
      '123.456.789-09',
      '000.000.000-00',
      '111.111.111-11',
      '123.456.789-10',
      'cpf-inválido'
    ]
    
    return {
      message: '✅ Teste de validação de CPF usando viu-shared',
      results: cpfs.map(cpf => ({
        cpf,
        valid: isValidCPF(cpf)
      })),
      success: true
    }
  })

  /**
   * 📧 Teste de Validação de Email
   */
  fastify.get('/test/email', async (request, reply) => {
    const emails = [
      'usuario@example.com',
      'test@viu.com.br',
      'email-inválido',
      '@domain.com',
      'user@',
      'valid.email+tag@domain.co.uk'
    ]
    
    return {
      message: '📧 Teste de validação de email usando viu-shared',
      results: emails.map(email => ({
        email,
        valid: isValidEmail(email)
      })),
      success: true
    }
  })

  /**
   * 🏢 Teste de Validação de CNPJ
   */
  fastify.get('/test/cnpj', async (request, reply) => {
    const cnpjs = [
      '11.222.333/0001-81',
      '00.000.000/0000-00',
      '12.345.678/0001-90',
      'cnpj-inválido'
    ]
    
    return {
      message: '🏢 Teste de validação de CNPJ usando viu-shared',
      results: cnpjs.map(cnpj => ({
        cnpj,
        valid: isValidCNPJ(cnpj)
      })),
      success: true
    }
  })

  /**
   * 📊 Teste de Enums e Constantes
   */
  fastify.get('/test/enums', async (request, reply) => {
    return {
      message: '📊 Teste de enums e constantes do viu-shared',
      data: {
        statusProjeto: Object.values(StatusProjeto),
        tipoUsuario: Object.values(TipoUsuario),
        appInfo: APP_INFO,
        supportedFileTypes: SUPPORTED_FILE_TYPES.slice(0, 5) // Primeiros 5
      },
      success: true
    }
  })

  /**
   * 🔍 Teste de Validação com Schema Zod
   */
  fastify.post('/test/validate-user', async (request, reply) => {
    try {
      // Tentar validar dados do usuário usando schema do viu-shared
      const userData = CreateUsuarioRequestSchema.parse(request.body)
      
      return {
        message: '🔍 Validação de usuário bem-sucedida!',
        validatedData: userData,
        success: true
      }
    } catch (error: any) {
      return reply.status(400).send({
        message: '❌ Erro de validação',
        errors: error.errors || error.message,
        success: false
      })
    }
  })

  /**
   * 🔐 Teste de Validação de Login
   */
  fastify.post('/test/validate-login', async (request, reply) => {
    try {
      // Tentar validar dados de login usando schema do viu-shared
      const loginData = LoginRequestSchema.parse(request.body)
      
      return {
        message: '🔐 Validação de login bem-sucedida!',
        validatedData: {
          email: loginData.email,
          // Não retornar senha por segurança
          hasPassword: !!loginData.senha
        },
        success: true
      }
    } catch (error: any) {
      return reply.status(400).send({
        message: '❌ Erro de validação de login',
        errors: error.errors || error.message,
        success: false
      })
    }
  })

  /**
   * 📁 Teste de Formatação de Tamanho de Arquivo
   */
  fastify.get('/test/file-size', async (request, reply) => {
    const tamanhos = [1024, 1048576, 1073741824, 500000, 0]
    
    return {
      message: '📁 Teste de formatação de tamanho de arquivo',
      results: tamanhos.map(size => ({
        bytes: size,
        formatted: formatFileSize(size)
      })),
      success: true
    }
  })

  /**
   * 🎯 Teste Completo - Todos os Recursos
   */
  fastify.get('/test/all', async (request, reply) => {
    return {
      message: '🎯 Teste completo da integração viu-shared',
      tests: {
        currency: formatCurrency(123456),
        phone: formatPhone('11987654321'),
        date: formatDate(new Date()),
        fileSize: formatFileSize(1048576),
        cpfValid: isValidCPF('123.456.789-09'),
        emailValid: isValidEmail('test@viu.com'),
        cnpjValid: isValidCNPJ('11.222.333/0001-81'),
        phoneValid: isValidPhone('(11) 98765-4321'),
        statusOptions: Object.values(StatusProjeto),
        userTypes: Object.values(TipoUsuario)
      },
      appInfo: APP_INFO,
      timestamp: new Date().toISOString(),
      success: true
    }
  })
}

