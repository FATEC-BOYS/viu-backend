// Run before any test module is evaluated — sets required env vars so that
// src/config/env.ts validation passes without a real environment.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://localhost:5432/viu_test'
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-000'
process.env.R2_ENDPOINT = 'https://r2.example.com'
process.env.R2_ACCESS_KEY_ID = 'test-r2-key-id'
process.env.R2_SECRET_ACCESS_KEY = 'test-r2-secret-key'
process.env.ALLOWED_ORIGINS = 'http://localhost:3000'
process.env.FRONTEND_URL = 'http://localhost:3000'
process.env.MP_ACCESS_TOKEN = ''
process.env.MP_WEBHOOK_SECRET = ''
// Flags de produto fixadas no padrão: o app carrega o .env do desenvolvedor,
// então sem isto a suíte passava ou falhava conforme o arquivo local de quem
// rodou. O comportamento de cada flag ligada é coberto nos testes de
// middleware, que a controlam explicitamente.
process.env.EXIGIR_EMAIL_VERIFICADO = 'false'
process.env.CAPTCHA_ENABLED = 'false'
