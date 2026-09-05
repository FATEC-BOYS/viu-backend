/**
 * Validação de ambiente — o que precisa estar certo antes do servidor subir.
 *
 * O foco aqui é o par COOKIE_SAMESITE + ALLOWED_ORIGINS. Com `SameSite=lax`,
 * o navegador já não manda o cookie numa escrita disparada por outro site, e a
 * lista de origens é sobretudo conveniência de CORS. Com `SameSite=none` —
 * obrigatório quando app e API ficam em domínios diferentes — essa proteção
 * some, e a checagem de `Origin` em authMiddleware passa a ser a única coisa
 * entre um site hostil e uma escrita autenticada. Aí a lista vira controle de
 * segurança, e um engano de configuração nela é uma vulnerabilidade.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const BASE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://localhost:5432/viu',
  JWT_SECRET: 'x'.repeat(40),
  R2_ENDPOINT: 'https://r2.example.com',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  MP_ACCESS_TOKEN: 'mp-token',
  MP_WEBHOOK_SECRET: 'mp-secret',
}

const originais = { ...process.env }

/** Reimporta env.ts do zero — ele valida no import, não sob demanda. */
async function carregarEnv(vars: Record<string, string>) {
  process.env = { ...BASE, ...vars } as any
  vi.resetModules()
  return import('../../src/config/env.js')
}

beforeEach(() => vi.resetModules())
afterEach(() => {
  process.env = { ...originais }
})

describe('ALLOWED_ORIGINS em produção', () => {
  it('recusa curinga — a lista é comparada por igualdade, então "*" nunca libera nada', async () => {
    // Sem esta guarda o deploy sobe achando que abriu para todos e na prática
    // bloqueia todos: o pior dos dois mundos, e silencioso.
    await expect(carregarEnv({ ALLOWED_ORIGINS: '*' })).rejects.toThrow(
      /Validação de variáveis de ambiente falhou/,
    )
  })

  it('recusa curinga misturado com origens reais', async () => {
    await expect(
      carregarEnv({ ALLOWED_ORIGINS: 'https://app.viu.com.br,*' }),
    ).rejects.toThrow(/Validação de variáveis de ambiente falhou/)
  })

  it('aceita lista explícita de origens https', async () => {
    const { env } = await carregarEnv({
      ALLOWED_ORIGINS: 'https://app.viu.com.br,https://www.viu.com.br',
    })
    expect(env.ALLOWED_ORIGINS).toContain('https://app.viu.com.br')
  })
})

describe('COOKIE_SAMESITE=none em produção', () => {
  it('recusa origem http — none exige Secure, e a origem hostil viria por https', async () => {
    await expect(
      carregarEnv({ COOKIE_SAMESITE: 'none', ALLOWED_ORIGINS: 'http://app.viu.com.br' }),
    ).rejects.toThrow(/Validação de variáveis de ambiente falhou/)
  })

  it('recusa localhost — quase sempre é ALLOWED_ORIGINS esquecido no default', async () => {
    await expect(
      carregarEnv({ COOKIE_SAMESITE: 'none', ALLOWED_ORIGINS: 'http://localhost:3000' }),
    ).rejects.toThrow(/Validação de variáveis de ambiente falhou/)
  })

  it('aceita origens https explícitas', async () => {
    const { env } = await carregarEnv({
      COOKIE_SAMESITE: 'none',
      ALLOWED_ORIGINS: 'https://app.viu.com.br',
    })
    expect(env.COOKIE_SAMESITE).toBe('none')
  })
})

describe('fora de produção a validação não atrapalha', () => {
  it('localhost segue valendo em desenvolvimento', async () => {
    const { env } = await carregarEnv({
      NODE_ENV: 'development',
      COOKIE_SAMESITE: 'none',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    })
    expect(env.ALLOWED_ORIGINS).toBe('http://localhost:3000')
  })
})
