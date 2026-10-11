# Deploy no Railway

## Pré-requisitos

- Conta no [Railway](https://railway.app)
- Repositório conectado ao Railway

## Passo a Passo

### 1. Criar serviço PostgreSQL

No painel do projeto Railway:
1. Clique em **+ New** → **Database** → **PostgreSQL**
2. O Railway cria a variável `DATABASE_URL` automaticamente

### 2. Configurar variáveis de ambiente

No serviço do backend (não no banco), vá em **Variables**:

```bash
# Banco — injetado automaticamente pelo Railway
DATABASE_URL=${{Postgres.DATABASE_URL}}

# JWT — gere com: openssl rand -base64 32
JWT_SECRET=<secret-forte>

# CORS
ALLOWED_ORIGINS=https://seu-frontend.vercel.app
FRONTEND_URL=https://seu-frontend.vercel.app

# Proxy — OBRIGATÓRIO no Railway, e o padrão (0) é o errado aqui.
#
# Sem isto o endereço que o servidor vê é o do proxy do Railway, igual para
# todo mundo. Todo limite chaveado por IP vira um balde único da plataforma:
# são 5 tentativas de login por 15 minutos somadas entre TODOS os usuários, e
# quem chega depois leva 429 sem ter feito nada.
TRUST_PROXY_HOPS=1

# Cookie de sessão — `none` quando o app e a API estão em domínios diferentes
# (vercel.app e railway.app são domínios diferentes; o navegador trata como
# cross-site e só manda o cookie com `none`). Com `none` a checagem de origem
# do authMiddleware passa a ser a única defesa contra CSRF, e é por isso que
# ALLOWED_ORIGINS acima precisa estar certo.
COOKIE_SAMESITE=none

# Cloudflare R2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET=viu

# MercadoPago (produção)
MP_ACCESS_TOKEN=<token>
MP_WEBHOOK_SECRET=<secret>

# Opcionais
OPENAI_API_KEY=<key>
RESEND_API_KEY=<key>
EMAIL_FROM=VIU <noreply@viu.app>
```

### 3. Build e Start commands

Em **Settings** do serviço:

| Campo | Valor |
|-------|-------|
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |

O `npm start` já executa `prisma migrate deploy` antes de iniciar o servidor — as migrations são aplicadas automaticamente a cada deploy.

### 4. Primeiro deploy

Na primeira vez, o Railway vai:
1. Instalar dependências e compilar TypeScript
2. Gerar o Prisma Client
3. Aplicar a baseline migration (cria todas as tabelas)
4. Iniciar o servidor

### 5. Deploys futuros

Quando o schema mudar:
1. Crie uma migration localmente: `npm run db:migrate`
2. Commit e push do arquivo gerado em `prisma/migrations/`
3. Railway aplica automaticamente via `prisma migrate deploy` no start

---

## Desenvolvimento local

```bash
cp .env.example .env   # configure DATABASE_URL local
npm install
npm run db:migrate     # cria/aplica migrations
npm run dev
```

Para inspecionar o banco:
```bash
npm run db:studio      # abre Prisma Studio em localhost:5555
```

---

## Troubleshooting

**Erro de variáveis de ambiente na inicialização**
Verifique se todas as variáveis obrigatórias estão configuradas no Railway.

**Migration falhou no start**
Veja os logs em **Deployments**. Corrija o problema, comite, e o Railway vai tentar novamente.

**Erro de conexão com o banco**
Confirme que o serviço PostgreSQL está no mesmo projeto e que `DATABASE_URL` referencia `${{Postgres.DATABASE_URL}}`.
