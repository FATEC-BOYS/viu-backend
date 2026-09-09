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
  // Rate limit global. Default preserva o comportamento anterior (hardcoded);
  // existe para dar folga em dev/testes e para ajustar em produção sem deploy.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('15 minutes'),
  /**
   * Quantos proxies existem na frente da API.
   *
   * Todo limite por IP depende de `request.ip` ser o IP de quem chamou. Atrás
   * de um proxy (Railway, Fly, um Nginx), sem isto o `request.ip` é o do
   * proxy — e aí o beta inteiro divide o mesmo balde: o sexto cadastro do dia
   * seria recusado mesmo vindo de outra pessoa.
   *
   * O número importa. `true` mandaria confiar em toda a cadeia de
   * X-Forwarded-For, que o cliente pode forjar para trocar de identidade a
   * cada requisição e nunca bater no limite. Com a contagem de saltos, o
   * endereço lido é o que o proxy de fora escreveu. Railway: 1. Local: 0.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  /**
   * Cadastro público. A hora conta tentativas (em memória, barato) e o dia
   * conta contas efetivamente criadas (no banco, sobrevive a deploy).
   */
  REGISTRO_MAX_HORA: z.coerce.number().int().positive().default(5),
  REGISTRO_MAX_DIA: z.coerce.number().int().positive().default(15),
  /** Clientes que um designer cria por hora pelo wizard (chave: o usuário). */
  CLIENTES_MAX_HORA: z.coerce.number().int().positive().default(20),
  /** Tentativas de login por IP a cada 15 minutos. */
  LOGIN_MAX_15MIN: z.coerce.number().int().positive().default(10),
  /** Cloudflare Turnstile no cadastro. Desligado, o registro segue sem widget. */
  CAPTCHA_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /**
   * Bloqueia escrita (projeto, arte, versão, link) de quem não confirmou o
   * e-mail. Fica desligado por padrão de propósito: com o bloqueio ligado
   * antes de o Resend estar entregando de verdade, ninguém consegue começar a
   * usar o produto e a causa não aparece em lugar nenhum da tela. Ligue depois
   * de confirmar, com um cadastro real, que o e-mail chega.
   */
  EXIGIR_EMAIL_VERIFICADO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Teto de quem não tem assinatura. Sem isto o plano "free" é ilimitado —
   * `requirePlanLimit` só olhava assinatura ativa, e usuário novo não tem
   * nenhuma.
   */
  BETA_MAX_PROJETOS: z.coerce.number().int().positive().default(3),
  BETA_MAX_ARTES: z.coerce.number().int().positive().default(20),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  // Cookies de sessão. 'lax' vale quando app e API compartilham o site
  // registrável (viu.app / api.viu.app, ou localhost:3000 / localhost:3001) e
  // já protege contra CSRF. Domínios diferentes exigem 'none' + HTTPS, e aí a
  // proteção passa a ser a guarda de origem em authMiddleware.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Opcional: define o domínio do cookie para compartilhá-lo entre subdomínios.
  COOKIE_DOMAIN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Sem DSN o SDK não sobe — error tracking é opt-in por ambiente.
  SENTRY_DSN: z.string().optional(),
  EMAIL_FROM: z.string().default('VIU <noreply@viu.app>'),
  // Cloudflare R2
  R2_ENDPOINT: z.string().min(1, 'R2_ENDPOINT é obrigatório'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID é obrigatório'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY é obrigatório'),
  R2_BUCKET: z.string().default('viu'),
  /**
   * Liga a cobrança (faturas por PIX e assinaturas).
   *
   * Antes as credenciais do MercadoPago eram exigidas por "estar em produção",
   * o que obrigava quem não cobra nada a abrir conta em gateway de pagamento só
   * para o servidor iniciar. A pergunta certa não é onde o servidor roda, e sim
   * se ele vai processar dinheiro.
   */
  COBRANCA_ATIVA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MP_ACCESS_TOKEN: z.string().default(''),
  MP_WEBHOOK_SECRET: z.string().default(''),
}).superRefine((data, ctx) => {
  // Vale em qualquer ambiente: com a flag ligada e sem segredo, o serviço não
  // tem como validar token nenhum. Ou o registro passaria a recusar todo mundo,
  // ou (pior) passaria a aceitar qualquer token — e o time acharia que está
  // protegido. Falhar no boot é o único desfecho honesto.
  if (data.CAPTCHA_ENABLED && !data.TURNSTILE_SECRET_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TURNSTILE_SECRET_KEY'],
      message: 'obrigatório quando CAPTCHA_ENABLED=true',
    })
  }

  // Cobrança ligada exige a configuração completa, em qualquer ambiente: sem
  // token não há como criar cobrança, e sem segredo não há como distinguir uma
  // confirmação de pagamento verdadeira de uma forjada.
  if (data.COBRANCA_ATIVA) {
    if (!data.MP_ACCESS_TOKEN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MP_ACCESS_TOKEN'], message: 'MP_ACCESS_TOKEN é obrigatório com COBRANCA_ATIVA=true' })
    }
    if (!data.MP_WEBHOOK_SECRET) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['MP_WEBHOOK_SECRET'], message: 'MP_WEBHOOK_SECRET é obrigatório com COBRANCA_ATIVA=true' })
    }
  }

  if (data.NODE_ENV !== 'production') return

  const origens = data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)

  // authMiddleware compara a origem por igualdade contra esta lista, então '*'
  // não abre nada — bloqueia tudo. Quem escreveu '*' acreditou no contrário, e
  // o deploy sobe com uma falsa sensação de configuração. Falhar aqui é mais
  // barato do que descobrir em produção.
  if (origens.includes('*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOWED_ORIGINS'],
      message: 'curinga "*" não é suportado — liste as origens explicitamente',
    })
  }

  // Com SameSite=none o navegador manda o cookie mesmo em requisição partida de
  // outro site: a proteção contra CSRF que o 'lax' dava desaparece e sobra só a
  // guarda de origem. Nesse modo a lista precisa estar de fato configurada —
  // uma origem http ou localhost aqui é ALLOWED_ORIGINS esquecido no default.
  if (data.COOKIE_SAMESITE === 'none') {
    const suspeitas = origens.filter(
      (o) => o.startsWith('http://') || /(^|\/\/)(localhost|127\.0\.0\.1)(:|$)/.test(o),
    )
    if (suspeitas.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOWED_ORIGINS'],
        message:
          `com COOKIE_SAMESITE=none a checagem de origem é a única defesa contra CSRF; ` +
          `use origens https explícitas (recebido: ${suspeitas.join(', ')})`,
      })
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
