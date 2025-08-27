import { createRemoteJWKSet, jwtVerify } from 'jose'
const JWKS = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/keys`))

export async function verifySupabaseJwt(bearer?: string) {
  if (!bearer?.startsWith('Bearer ')) throw new Error('Auth ausente')
  const token = bearer.slice('Bearer '.length)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
  })
  return payload as { sub: string; email?: string }
}
