// Testes com banco real: só as variáveis que o config/env.ts exige para o
// módulo carregar. DATABASE_URL vem do ambiente (scripts/pg-test.sh ou CI) e
// não é sobrescrita aqui — é justamente o banco que queremos usar.
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-000'
process.env.R2_ENDPOINT = 'https://r2.example.com'
process.env.R2_ACCESS_KEY_ID = 'test-r2-key-id'
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-key'
process.env.ALLOWED_ORIGINS = 'http://localhost:3000'
process.env.FRONTEND_URL = 'http://localhost:3000'
process.env.MP_ACCESS_TOKEN = ''
process.env.MP_WEBHOOK_SECRET = ''

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida — rode via `npm run test:db`')
}
