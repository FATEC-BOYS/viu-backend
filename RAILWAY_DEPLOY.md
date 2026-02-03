# 🚀 Deploy no Railway - Guia Completo

Este guia te ajuda a fazer o deploy do VIU Backend no Railway com banco de dados PostgreSQL.

## 📋 Pré-requisitos

- Conta no [Railway](https://railway.app)
- Repositório Git do projeto
- Conhecimento básico de variáveis de ambiente

## 🎯 Passo a Passo

### 1. Criar Novo Projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em "New Project"
3. Selecione "Deploy from GitHub repo"
4. Escolha o repositório `FATEC-BOYS/viu-backend`

### 2. Adicionar Banco de Dados PostgreSQL

1. No seu projeto do Railway, clique em "+ New"
2. Selecione "Database"
3. Escolha "PostgreSQL"
4. O Railway vai criar automaticamente um banco PostgreSQL
5. Copie a variável `DATABASE_URL` que será gerada automaticamente

> **💡 Dica:** O Railway gera automaticamente a `DATABASE_URL` quando você adiciona o PostgreSQL. Você não precisa configurá-la manualmente!

### 3. Configurar Variáveis de Ambiente

No painel do seu serviço (não do banco), vá em **Variables** e adicione:

#### Variáveis Obrigatórias

```bash
# 🗄️ Banco de Dados
# Esta variável é criada automaticamente quando você conecta o PostgreSQL
DATABASE_URL=${{Postgres.DATABASE_URL}}

# 🔐 JWT Secrets
# IMPORTANTE: Gere secrets fortes em produção!
# Você pode usar: openssl rand -base64 32
JWT_SECRET=cole_aqui_um_secret_super_seguro_gerado

# OU use secrets separados (escolha uma das opções):
# JWT_ACCESS_SECRET=cole_aqui_access_secret
# JWT_REFRESH_SECRET=cole_aqui_refresh_secret

# 🌐 URLs permitidas pelo CORS
# Adicione a URL do seu frontend aqui
ALLOWED_ORIGINS=https://seu-frontend.vercel.app,https://viu-frontend.railway.app

# 🔗 URL da aplicação (para links compartilhados)
APP_URL=https://seu-backend.railway.app
```

#### Variáveis Opcionais (se você usar Supabase)

```bash
# 🔐 Supabase (opcional - apenas se usar autenticação do Supabase)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=sua_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui

# 📧 Frontend URL
FRONTEND_URL=https://seu-frontend.vercel.app
```

### 4. Configurar Build e Start

O Railway detecta automaticamente o `package.json`, mas você precisa configurar manualmente:

**No Railway**, vá em **Settings** do seu serviço backend:

**Build Command:**
```bash
npm run build && npx prisma generate && npx prisma db push --accept-data-loss
```

**Start Command:**
```bash
npm start
```

> **⚠️ Importante:**
> - O `--accept-data-loss` é necessário porque estamos adicionando novos campos ao schema
> - O comando `prisma db push` vai criar/atualizar as tabelas no banco automaticamente
> - Isso é seguro em deploys iniciais (banco vazio ou novos campos opcionais)

### 5. Deploy

1. Depois de configurar as variáveis, o Railway vai fazer o deploy automaticamente
2. Aguarde o build completar (pode levar alguns minutos)
3. Verifique os logs em "Deployments" para ver se tudo está OK

### 6. Verificar se Funcionou

1. Copie a URL do seu serviço (algo como `https://viu-backend-production.up.railway.app`)
2. Acesse `https://sua-url.railway.app/` no navegador
3. Você deve ver a mensagem:

```json
{
  "status": "ok",
  "message": "VIU Backend API rodando!",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔐 Como Gerar Secrets Seguros

Para gerar secrets fortes para JWT, use um destes métodos:

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Node.js:**
```javascript
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Online:**
- Use [randomkeygen.com](https://randomkeygen.com/)
- Ou [passwordsgenerator.net](https://passwordsgenerator.net/)

## 🔄 Como Configurar Build Command no Railway

### Passo 1: Acesse Settings

1. No Railway, clique no seu serviço backend (não no PostgreSQL)
2. Vá na aba **Settings**
3. Role até a seção **Build**

### Passo 2: Configure Build Command

No campo **Build Command**, cole:

```bash
npm run build && npx prisma generate && npx prisma db push --accept-data-loss
```

### Passo 3: Configure Start Command

No campo **Start Command**, cole:

```bash
npm start
```

### Passo 4: Salve e Redeploy

1. Clique em **Save**
2. Vá em **Deployments**
3. Clique em **Redeploy** (botão com três pontos)

### ⚠️ Por que `--accept-data-loss`?

A flag `--accept-data-loss` é necessária porque estamos:
- Adicionando novos campos (`supabaseId`, `provider`)
- Tornando o campo `senha` opcional
- Adicionando constraints unique em campos novos

**Isso é seguro porque:**
- ✅ São campos novos (não afeta dados existentes)
- ✅ Campos opcionais (podem ser `null`)
- ✅ Não estamos removendo dados

## 🔄 Configuração Automática do Railway

O Railway automaticamente:
- ✅ Detecta que é um projeto Node.js
- ✅ Instala as dependências com `npm install`
- ✅ Executa o comando de build que você configurou
- ✅ Conecta o banco PostgreSQL
- ✅ Gera a `DATABASE_URL`

## 📊 Após o Deploy

### Conectar o Frontend

No seu frontend (Vercel/Netlify), configure a variável:

```bash
VITE_API_URL=https://seu-backend.railway.app
# ou
NEXT_PUBLIC_API_URL=https://seu-backend.railway.app
```

### Acessar o Banco de Dados

Você pode acessar o banco usando:

1. **Railway Dashboard**: Vá em "Data" no serviço PostgreSQL
2. **Prisma Studio** (localmente):
   ```bash
   # Copie a DATABASE_URL do Railway
   # Cole no seu .env local
   npx prisma studio
   ```
3. **Cliente SQL** (DBeaver, TablePlus, etc):
   - Use a `DATABASE_URL` fornecida pelo Railway

## 🐛 Troubleshooting

### Erro: "Variáveis de ambiente inválidas"

Se você ver este erro:
```
❌ Variáveis de ambiente inválidas:
  - DATABASE_URL: Required
  - JWT_ACCESS_SECRET: Required
```

**Solução:**
1. Verifique se adicionou todas as variáveis obrigatórias no Railway
2. Para `DATABASE_URL`: certifique-se de que o PostgreSQL está conectado
3. Para JWT: adicione `JWT_SECRET` OU (`JWT_ACCESS_SECRET` E `JWT_REFRESH_SECRET`)

### Erro de Build

Se o build falhar:
1. Verifique os logs em "Deployments"
2. Certifique-se de que o Node.js está na versão >= 18
3. Limpe o cache e tente novamente

### Erro: "Use the --accept-data-loss flag"

Se você ver este erro durante o deploy:
```
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns `[supabaseId]` on the table `usuarios` will be added.
Error: Use the --accept-data-loss flag to ignore the data loss warnings
```

**Solução:**
1. Vá em **Settings** do seu serviço no Railway
2. No campo **Build Command**, certifique-se de ter:
   ```bash
   npm run build && npx prisma generate && npx prisma db push --accept-data-loss
   ```
3. Salve e faça **Redeploy**

**Por que isso acontece?**
- Estamos adicionando novos campos ao schema (`supabaseId`, `provider`)
- O Prisma alerta sobre possível perda de dados (mas é seguro neste caso)
- Os campos são opcionais e não afetam dados existentes

### Erro de Conexão com Banco

Se o Prisma não conseguir conectar:
1. Verifique se a variável `DATABASE_URL` está configurada
2. Certifique-se de que o PostgreSQL está rodando
3. Tente fazer o push do schema manualmente:
   ```bash
   npx prisma db push --accept-data-loss
   ```

## 🎉 Pronto!

Seu backend VIU está no ar! 🚀

Agora você pode:
- ✅ Conectar seu frontend
- ✅ Testar as APIs
- ✅ Criar usuários
- ✅ Fazer autenticação com Google (via Supabase)
- ✅ Usar todas as funcionalidades do sistema

## 📚 Próximos Passos

1. Configure o monitoramento no Railway
2. Adicione um domínio customizado
3. Configure backups automáticos do banco
4. Ative os logs de aplicação

## 🔗 Links Úteis

- [Documentação do Railway](https://docs.railway.app/)
- [Documentação do Prisma](https://www.prisma.io/docs)
- [Supabase Setup Guide](./SUPABASE_SETUP.md)
- [Frontend Integration](./INTEGRACAO_FRONTEND.md)

## 💬 Precisa de Ajuda?

Se encontrar problemas:
1. Verifique os logs no Railway Dashboard
2. Consulte a [documentação](./README.md)
3. Abra uma issue no GitHub
