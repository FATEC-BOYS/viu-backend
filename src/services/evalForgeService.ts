const EVALFORGE_URL = process.env.EVALFORGE_URL ?? 'http://localhost:8000'
const EVALFORGE_KEY = process.env.EVALFORGE_INTERNAL_KEY ?? ''

export interface DimensionScore {
  score: number
  justification: string
}

export interface BriefingEvalResult {
  passed: boolean
  verdict: 'PASS' | 'FAIL'
  scores: Record<string, DimensionScore>
}

const BRIEFING_DIMENSIONS = [
  {
    name: 'completude',
    description: 'O briefing descreve o objetivo do projeto, o público-alvo ou contexto de uso, e o resultado esperado?',
    weight: 0.35,
    min_pass_score: 6.0,
  },
  {
    name: 'clareza',
    description: 'As informações estão descritas de forma clara, sem ambiguidade, permitindo que o designer entenda o que deve ser entregue?',
    weight: 0.35,
    min_pass_score: 6.0,
  },
  {
    name: 'acionabilidade',
    description: 'Com este briefing, um designer consegue começar a trabalhar imediatamente sem precisar de esclarecimentos adicionais?',
    weight: 0.30,
    min_pass_score: 6.0,
  },
]

export async function evaluateBriefing(descricao: string): Promise<BriefingEvalResult> {
  if (!EVALFORGE_KEY || !descricao || descricao.trim().length < 30) {
    return { passed: true, verdict: 'PASS', scores: {} }
  }

  try {
    const res = await fetch(`${EVALFORGE_URL}/internal/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': EVALFORGE_KEY,
      },
      body: JSON.stringify({
        task: 'Avaliar se o briefing de um projeto criativo tem informações suficientes para um designer profissional começar a trabalhar sem precisar de esclarecimentos adicionais.',
        input: descricao,
        model: process.env.EVALFORGE_MODEL ?? 'claude-sonnet-4-6',
        dimensions: BRIEFING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      // evalforge unavailable — allow creation to proceed
      return { passed: true, verdict: 'PASS', scores: {} }
    }

    const body = await res.json()
    const verdict: 'PASS' | 'FAIL' = body.result?.verdict === 'FAIL' ? 'FAIL' : 'PASS'
    return {
      passed: verdict === 'PASS',
      verdict,
      scores: body.result?.scores ?? {},
    }
  } catch {
    // network error or timeout — fail open
    return { passed: true, verdict: 'PASS', scores: {} }
  }
}
