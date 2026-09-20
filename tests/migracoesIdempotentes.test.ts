import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations')

/*
 * As migrações anteriores a 2026-09-19 ficam de fora.
 *
 * Não é indulgência: elas já aplicaram em produção, e reescrevê-las não
 * conserta nada — o estrago de uma migração não idempotente só acontece na
 * PRIMEIRA vez que ela roda. Cobrar delas agora seria trabalho sem efeito, com
 * o risco de mexer em SQL que já rodou.
 */
const ANTERIORES_AO_GUARDA = new Set(
  fs.readdirSync(DIR)
    .filter((n) => n < '20260919120000' && n !== 'migration_lock.toml'),
)

/**
 * Comandos que explodem se o objeto já existir (ou já não existir), com a
 * forma idempotente que cada um aceita.
 */
const EXIGENCIAS: Array<{ padrao: RegExp; forma: string }> = [
  { padrao: /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\s+)(?!IF\s+NOT\s+EXISTS)/i, forma: 'CREATE INDEX IF NOT EXISTS' },
  { padrao: /\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/i, forma: 'ADD COLUMN IF NOT EXISTS' },
  { padrao: /\bDROP\s+COLUMN\s+(?!IF\s+EXISTS)/i, forma: 'DROP COLUMN IF EXISTS' },
  { padrao: /\bDROP\s+CONSTRAINT\s+(?!IF\s+EXISTS)/i, forma: 'DROP CONSTRAINT IF EXISTS' },
  { padrao: /\bDROP\s+INDEX\s+(?!IF\s+EXISTS)/i, forma: 'DROP INDEX IF EXISTS' },
  { padrao: /\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, forma: 'CREATE TABLE IF NOT EXISTS' },
]

function semComentarios(sql: string) {
  return sql
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('--'))
    .join('\n')
}

/*
 * Uma migração que morre pela metade tranca TODOS os deploys seguintes.
 *
 * Aconteceu: `20260919120000_notificacao_entidade` falhou no deploy de
 * 2026-09-19 21:13 UTC, e a partir dali todo deploy do backend parou com
 * P3009 — "migrate found failed migrations in the target database" —, sem
 * nunca chegar na migração seguinte. O sintoma para quem opera é o backend
 * fora do ar, e a saída parecia ser dropar o banco.
 *
 * Idempotente, a reexecução é inofensiva: a recuperação vira um
 * `migrate resolve --rolled-back` e um novo deploy. Sem isso, a segunda
 * tentativa bate em "already exists" (42P07 / 42701) e trava de novo — que foi
 * exatamente como as duas quebras desta semana se comportaram.
 */
describe('Migrações novas são reexecutáveis', () => {
  const novas = fs
    .readdirSync(DIR)
    .filter((nome) => nome !== 'migration_lock.toml' && !ANTERIORES_AO_GUARDA.has(nome))

  it('existe migração nova para conferir', () => {
    // Se isto zerar, o guarda parou de guardar alguma coisa.
    expect(novas.length).toBeGreaterThan(0)
  })

  for (const nome of novas) {
    it(`${nome} usa as formas que aguentam rodar duas vezes`, () => {
      const sql = semComentarios(fs.readFileSync(path.join(DIR, nome, 'migration.sql'), 'utf8'))

      const faltando = EXIGENCIAS.filter(({ padrao }) => padrao.test(sql)).map(({ forma }) => forma)

      expect(faltando, `use ${faltando.join(', ')} em ${nome}/migration.sql`).toEqual([])
    })
  }
})
