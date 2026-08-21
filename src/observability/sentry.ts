import * as Sentry from '@sentry/node'
import { env } from '../config/env.js'

/**
 * Error tracking.
 *
 * Sem SENTRY_DSN o SDK não é iniciado e nada é enviado — o processo roda
 * exatamente como antes. É de propósito: o DSN só existe depois que alguém
 * cria a conta, e um SDK que nunca foi exercitado é um SDK que se descobre
 * mal configurado no dia do lançamento.
 *
 * O pré-requisito para isto valer alguma coisa já foi resolvido: os catch dos
 * controllers registram o erro com o requestId em vez de descartá-lo, e o
 * setErrorHandler global é onde o handler do Sentry se pluga.
 *
 * Este módulo é importado antes de qualquer outro em index.ts para que a
 * inicialização aconteça cedo. Instrumentação automática completa em ESM
 * exigiria `node --import ./sentry-instrument.mjs`; aqui o objetivo é captura
 * de exceção, não tracing.
 */
export const sentryHabilitado = Boolean(env.SENTRY_DSN)

if (sentryHabilitado) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Tracing custa plano e não é o que se procura aqui; ligar quando houver
    // tráfego real para observar.
    tracesSampleRate: 0,
    // O corpo da requisição pode conter senha, token e PII.
    sendDefaultPii: false,
  })
}

export { Sentry }
