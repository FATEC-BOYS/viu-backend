/**
 * 🔧 Validação de Variáveis de Ambiente
 *
 * Valida e tipifica as variáveis de ambiente necessárias para a aplicação
 * usando Zod para validação em runtime.
 */

import { z } from 'zod'

// Schema de validação das variáveis de ambiente
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  // JWT - Suporta tanto JWT_SECRET quanto JWT_ACCESS_SECRET/JWT_REFRESH_SECRET
  JWT_SECRET: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Supabase (opcional)
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  // App URL (para links compartilhados)
  APP_URL: z.string().optional(),

  // OpenAI (opcional)
  OPENAI_API_KEY: z.string().optional(),

  // Frontend URLs
  FRONTEND_URL: z.string().optional(),
  MOBILE_DEEP_LINK: z.string().optional(),
})

// Validação customizada: deve ter JWT_SECRET OU (JWT_ACCESS_SECRET E JWT_REFRESH_SECRET)
const validateJWT = (env: z.infer<typeof envSchema>) => {
  const hasJwtSecret = !!env.JWT_SECRET
  const hasAccessAndRefresh = !!(env.JWT_ACCESS_SECRET && env.JWT_REFRESH_SECRET)

  if (!hasJwtSecret && !hasAccessAndRefresh) {
    throw new Error(
      'Configuração JWT inválida: forneça JWT_SECRET OU (JWT_ACCESS_SECRET e JWT_REFRESH_SECRET)'
    )
  }

  return env
}

// Função para validar as variáveis de ambiente
export function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env)
    return validateJWT(parsed)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Variáveis de ambiente inválidas:')
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      throw new Error('Validação de variáveis de ambiente falhou')
    }
    throw error
  }
}

// Exporta as variáveis validadas e tipadas
export const env = validateEnv()

// Helper para pegar o JWT secret (seja qual for o formato)
export function getJWTSecret(): string {
  return env.JWT_SECRET || env.JWT_ACCESS_SECRET || ''
}

export function getJWTRefreshSecret(): string {
  return env.JWT_SECRET || env.JWT_REFRESH_SECRET || ''
}
