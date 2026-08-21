import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O ponto do módulo é ser inerte sem DSN: nada de rede, nada de SDK de pé.
 * Estes testes fixam esse contrato nos dois sentidos.
 */
const initMock = vi.fn()

vi.mock('@sentry/node', () => ({
  init: (...args: unknown[]) => initMock(...args),
  setupFastifyErrorHandler: vi.fn(),
}))

beforeEach(() => {
  initMock.mockClear()
  vi.resetModules()
})

describe('observability/sentry', () => {
  it('não inicia o SDK quando SENTRY_DSN está ausente', async () => {
    vi.doMock('../../src/config/env.js', () => ({
      env: { SENTRY_DSN: undefined, NODE_ENV: 'test' },
    }))

    const mod = await import('../../src/observability/sentry.js')

    expect(mod.sentryHabilitado).toBe(false)
    expect(initMock).not.toHaveBeenCalled()
  })

  it('inicia com o DSN configurado, sem tracing e sem PII', async () => {
    vi.doMock('../../src/config/env.js', () => ({
      env: { SENTRY_DSN: 'https://exemplo@o0.ingest.sentry.io/0', NODE_ENV: 'production' },
    }))

    const mod = await import('../../src/observability/sentry.js')

    expect(mod.sentryHabilitado).toBe(true)
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://exemplo@o0.ingest.sentry.io/0',
        environment: 'production',
        tracesSampleRate: 0,
        sendDefaultPii: false,
      }),
    )
  })
})
