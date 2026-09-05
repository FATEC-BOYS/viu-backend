import { SignJWT } from 'jose'

export interface TestUser {
  id: string
  email: string
  nome: string
  tipo: 'ADMIN' | 'DESIGNER' | 'CLIENTE'
}

export const DESIGNER: TestUser = {
  id: 'cdesigner000000001',
  email: 'designer@test.com',
  nome: 'Test Designer',
  tipo: 'DESIGNER',
}

export const CLIENTE: TestUser = {
  id: 'ccliente0000000001',
  email: 'cliente@test.com',
  nome: 'Test Cliente',
  tipo: 'CLIENTE',
}

/**
 * Segundo tenant — usado nos testes de IDOR.
 *
 * Designer A (DESIGNER) e Designer B (DESIGNER_B) não compartilham nenhum
 * projeto: tudo que A alcança de B é vazamento.
 */
export const DESIGNER_B: TestUser = {
  id: 'cdesignerb00000001',
  email: 'designer-b@test.com',
  nome: 'Test Designer B',
  tipo: 'DESIGNER',
}

export const CLIENTE_B: TestUser = {
  id: 'cclienteb000000001',
  email: 'cliente-b@test.com',
  nome: 'Test Cliente B',
  tipo: 'CLIENTE',
}

export const ADMIN: TestUser = {
  id: 'cadmin00000000001',
  email: 'admin@test.com',
  nome: 'Test Admin',
  tipo: 'ADMIN',
}

export async function makeToken(user: TestUser = DESIGNER): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!)
  return new SignJWT({ email: user.email, nome: user.nome, tipo: user.tipo })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime('1h')
    .sign(secret)
}

export const ORIGIN = { origin: 'http://localhost:3000' }
