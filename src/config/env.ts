import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  OPENAI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('VIU <noreply@viu.app>'),
  // Cloudflare R2
  R2_ENDPOINT: z.string().min(1, 'R2_ENDPOINT é obrigatório'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID é obrigatório'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY é obrigatório'),
  R2_BUCKET: z.string().default('viu'),
  // MercadoPago — empty allowed in dev/test; required in production (see superRefine below)
  MP_ACCESS_TOKEN: z.string().default(''),
  MP_WEBHOOK_SECRET: z.string().default(''),
  // WhatsApp Business (Meta Cloud API) — opcionais enquanto a integração não está
  // ativa; o webhook responde 403/401 e os envios falham com erro claro se ausentes
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.MP_ACCESS_TOKEN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MP_ACCESS_TOKEN'], message: 'MP_ACCESS_TOKEN é obrigatório em produção' })
    }
    if (!data.MP_WEBHOOK_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MP_WEBHOOK_SECRET'], message: 'MP_WEBHOOK_SECRET é obrigatório em produção' })
    }
  }
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Variáveis de ambiente inválidas:')
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
    }
    throw new Error('Validação de variáveis de ambiente falhou')
  }
}

export const env = validateEnv()

export function getJWTSecret(): string {
  return env.JWT_SECRET
}
