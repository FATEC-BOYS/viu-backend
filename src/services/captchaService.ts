import { env } from '../config/env.js'

/**
 * Cloudflare Turnstile no cadastro público.
 *
 * O widget do navegador não prova nada sozinho: quem chama a API direto não
 * carrega widget nenhum. O que vale é esta verificação no servidor, contra o
 * `siteverify` da Cloudflare, com o segredo que nunca sai daqui.
 *
 * Fica atrás de `CAPTCHA_ENABLED` porque em desenvolvimento não há chave nem
 * domínio configurado, e travar o cadastro local tornaria o produto
 * impossível de testar. A validação do env recusa o boot se a flag estiver
 * ligada sem o segredo — o meio-termo silencioso é que seria perigoso.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 5000

export interface ResultadoCaptcha {
  valido: boolean
  motivo?: string
}

export async function verificarCaptcha(
  token: string | undefined,
  ip?: string,
): Promise<ResultadoCaptcha> {
  if (!env.CAPTCHA_ENABLED) return { valido: true }

  if (!token) return { valido: false, motivo: 'captcha ausente' }

  const corpo = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY as string,
    response: token,
  })
  // A Cloudflare usa o IP para pontuar o desafio. Vale o mesmo cuidado do
  // rate limit: só faz sentido mandar o IP real, que depende de TRUST_PROXY_HOPS.
  if (ip) corpo.set('remoteip', ip)

  try {
    const resposta = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const dados = (await resposta.json()) as {
      success?: boolean
      'error-codes'?: string[]
    }

    if (dados.success) return { valido: true }
    return { valido: false, motivo: (dados['error-codes'] ?? []).join(', ') || 'desafio recusado' }
  } catch {
    // Cloudflare fora do ar ou lenta. Recusar seria derrubar o cadastro do
    // produto inteiro por causa de um terceiro; aceitar seria abrir a porta
    // justamente quando alguém pode estar derrubando o serviço de propósito.
    // Fica com aceitar, porque o limite por IP continua de pé atrás disto e
    // é ele quem impede volume — o captcha só encarece o caso individual.
    return { valido: true, motivo: 'siteverify indisponível' }
  }
}
