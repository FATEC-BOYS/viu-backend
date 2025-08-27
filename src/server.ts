// src/server.ts
import express from 'express'
import cors from 'cors'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const app = express()
app.use(cors())
app.use(express.json())

const supa = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const JWKS = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/keys`))

async function verifySupabaseJwt(bearer?: string) {
  if (!bearer?.startsWith('Bearer ')) throw new Error('Auth ausente')
  const token = bearer.slice('Bearer '.length)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
  })
  return payload as { sub: string; email?: string }
}

async function ensureUsuario(uid: string, email?: string | null) {
  const { data: found } = await supa.from('usuarios').select('id').eq('id', uid).maybeSingle()
  if (!found) {
    await supa.from('usuarios').insert({
      id: uid, email: email ?? `${uid}@ghost.local`,
      senha: '', nome: email ?? 'Usuário', tipo: 'CLIENTE', ativo: true
    })
  }
}

/** path no formato "<bucket>/<chave>" -> URL assinada */
async function signPath(path: string, expires = 3600): Promise<string | null> {
  if (!path || /^https?:\/\//i.test(path)) return path // já é URL
  const [bucket, ...rest] = path.split('/')
  const key = rest.join('/')
  if (!bucket || !key) return null
  const { data, error } = await supa.storage.from(bucket).createSignedUrl(key, expires)
  if (error || !data) return null
  return data.signedUrl
}

app.get('/healthz', (_, res) => res.json({ ok: true }))

// --- Arte: retorna com arquivo_url assinado se "arquivo" for path do storage
app.get('/artes/:id', async (req, res) => {
  try {
    const auth = await verifySupabaseJwt(req.headers.authorization as any)
    await ensureUsuario(auth.sub, auth.email as any)

    const { data: arte, error } = await supa.from('artes').select('*').eq('id', req.params.id).single()
    if (error || !arte) return res.status(404).json({ error: error?.message ?? 'Arte não encontrada' })
    const arquivo_url = await signPath(arte.arquivo)
    res.json({ ...arte, arquivo_url })
  } catch (e: any) {
    res.status(401).json({ error: e.message })
  }
})

// --- Feedbacks: lista e assina audios na resposta
app.get('/feedbacks', async (req, res) => {
  try {
    const auth = await verifySupabaseJwt(req.headers.authorization as any)
    await ensureUsuario(auth.sub, auth.email as any)

    const arteId = String(req.query.arteId)
    const { data, error } = await supa
      .from('feedbacks')
      .select('*')
      .eq('arte_id', arteId)
      .order('criado_em', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })

    const hydrated = await Promise.all((data ?? []).map(async fb => {
      let arquivo_url: string | null = null
      if (fb.tipo === 'AUDIO' && fb.arquivo) {
        arquivo_url = await signPath(fb.arquivo)
      }
      return { ...fb, arquivo_url }
    }))

    res.json(hydrated)
  } catch (e: any) {
    res.status(401).json({ error: e.message })
  }
})

// --- Criar feedback (guarde SEMPRE o *path* no campo "arquivo")
app.post('/feedbacks', async (req, res) => {
  try {
    const auth = await verifySupabaseJwt(req.headers.authorization as any)
    await ensureUsuario(auth.sub, auth.email as any)

    const body = z.object({
      arteId: z.string(),
      tipo: z.enum(['TEXTO', 'AUDIO']),
      conteudo: z.string().optional().nullable(),
      arquivo: z.string().optional().nullable(), // ex: "audios/<uid>/<file>.webm"
      posicaoX: z.number().min(0).max(1).optional().nullable(),
      posicaoY: z.number().min(0).max(1).optional().nullable(),
    }).parse(req.body)

    const { data, error } = await supa.from('feedbacks').insert({
      arte_id: body.arteId,
      autor_id: auth.sub,
      tipo: body.tipo,
      conteudo: body.conteudo ?? '',
      arquivo: body.arquivo ?? null, // path, não URL
      posicao_x: body.posicaoX ?? null,
      posicao_y: body.posicaoY ?? null,
    }).select('*').single()

    if (error) return res.status(400).json({ error: error.message })
    // devolve já com arquivo_url se for áudio
    const arquivo_url = data?.tipo === 'AUDIO' && data?.arquivo ? await signPath(data.arquivo) : null
    res.status(201).json({ ...data, arquivo_url })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// --- Gerar link compartilhado p/ ARTE
app.post('/links', async (req, res) => {
  try {
    const auth = await verifySupabaseJwt(req.headers.authorization as any)
    await ensureUsuario(auth.sub, auth.email as any)

    const body = z.object({
      arteId: z.string(),
      expiraEm: z.string().datetime().optional(),
      somenteLeitura: z.boolean().optional().default(true),
    }).parse(req.body)

    const token = cryptoRandom(24)
    const { error } = await supa.from('link_compartilhado').insert({
      token,
      tipo: 'ARTE',
      arte_id: body.arteId,
      expira_em: body.expiraEm ?? null,
      somente_leitura: body.somenteLeitura,
    })
    if (error) return res.status(400).json({ error: error.message })
    res.json({ url: `${process.env.APP_URL ?? 'http://localhost:8080'}/preview/${token}` })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// --- Preview público pelo token (sem login) - retorna arte+feedbacks com URLs assinadas
app.get('/preview/:token', async (req, res) => {
  try {
    const token = req.params.token
    const { data: link, error: e1 } = await supa
      .from('link_compartilhado')
      .select('*')
      .eq('token', token)
      .single()
    if (e1 || !link) return res.status(404).json({ error: 'Link inválido' })
    if (link.expira_em && new Date(link.expira_em) < new Date()) {
      return res.status(410).json({ error: 'Link expirado' })
    }
    if (link.tipo !== 'ARTE' || !link.arte_id) {
      return res.status(400).json({ error: 'Tipo de link não suportado' })
    }

    const { data: arte, error: e2 } = await supa.from('artes').select('*').eq('id', link.arte_id).single()
    if (e2 || !arte) return res.status(404).json({ error: 'Arte não encontrada' })

    const arquivo_url = await signPath(arte.arquivo)

    const { data: feedbacks, error: e3 } = await supa
      .from('feedbacks')
      .select('*')
      .eq('arte_id', arte.id)
      .order('criado_em', { ascending: false })

    if (e3) return res.status(400).json({ error: e3.message })

    const hydrated = await Promise.all((feedbacks ?? []).map(async fb => {
      const arquivo_url = fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null
      return { ...fb, arquivo_url }
    }))

    res.json({
      somenteLeitura: !!link.somente_leitura,
      arte: { ...arte, arquivo_url },
      feedbacks: hydrated,
    })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

function cryptoRandom(n = 24) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2,'0')).join('')
}

app.listen(process.env.PORT ?? 3333, () =>
  console.log(`API on :${process.env.PORT ?? 3333}`)
)
