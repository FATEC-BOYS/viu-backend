# 🚀 Guia de Configuração do Supabase

## 📋 Passo a Passo

### 1️⃣ Criar Projeto no Supabase

1. Acesse: https://supabase.com/dashboard
2. Clique em **"New Project"**
3. Escolha:
   - **Organization**: Sua organização
   - **Name**: VIU Backend
   - **Database Password**: Crie uma senha FORTE (você vai precisar dela!)
   - **Region**: Escolha o mais próximo (ex: South America - São Paulo)
   - **Pricing Plan**: Free (ou Pro se precisar)
4. Clique em **"Create new project"**
5. ⏳ Aguarde ~2 minutos enquanto cria

---

### 2️⃣ Executar Schema SQL

1. No dashboard do Supabase, vá em: **SQL Editor** (menu lateral)
2. Clique em **"New query"**
3. Abra o arquivo **`supabase-schema.sql`** deste repositório
4. **Copie TODO o conteúdo** do arquivo
5. **Cole no SQL Editor**
6. Clique em **"Run"** (ou Ctrl+Enter)
7. ✅ Deve aparecer: **"Success. No rows returned"**

**O que esse script faz:**
- ✅ Cria todas as 11 tabelas do sistema
- ✅ Cria todos os índices de performance
- ✅ Configura triggers de atualização automática
- ✅ Insere um usuário admin de teste

---

### 3️⃣ Copiar Credenciais do Supabase

#### 3.1 Connection String (DATABASE_URL)

1. Vá em: **Settings > Database** (menu lateral)
2. Role até **"Connection string"**
3. Selecione a aba **"URI"**
4. **IMPORTANTE**: Use **"Connection pooling"** (mode: Session)
5. Copie a string que começa com:
   ```
   postgresql://postgres.[PROJECT_REF]:[PASSWORD]@...
   ```
6. **Substitua `[PASSWORD]`** pela senha que você criou no passo 1

**Exemplo:**
```
postgresql://postgres.abcdefghijklmnop:MinhaS3nh@F0rt3@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

#### 3.2 Supabase Keys

1. Vá em: **Settings > API** (menu lateral)
2. Copie:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: Começa com `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key**: Começa com `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (⚠️ NUNCA exponha no frontend!)

---

### 4️⃣ Configurar .env Local

1. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env
   ```

2. Abra o `.env` e preencha as variáveis do Supabase:

```bash
# 🗄️ BANCO DE DADOS - Cole a Connection String
DATABASE_URL="postgresql://postgres.xxxxx:SuaSenha@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# 🔐 SUPABASE KEYS - Cole as keys do dashboard
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. **Mude também o JWT_SECRET** (obrigatório!):
```bash
JWT_SECRET=uma_string_aleatoria_muito_segura_com_pelo_menos_32_caracteres
```

Gere um secret aleatório:
```bash
openssl rand -base64 32
```

---

### 5️⃣ Sincronizar Prisma

Agora vamos sincronizar o Prisma com o banco:

```bash
# Gera o Prisma Client baseado no schema
npm run db:generate

# Envia o schema para o Supabase (se necessário)
# ATENÇÃO: Só rode isso se NÃO executou o SQL no passo 2
# npm run db:push
```

**⚠️ IMPORTANTE:**
- Se você executou o `supabase-schema.sql` no passo 2, **NÃO precisa** rodar `db:push`
- O schema já está criado no Supabase
- Só rode `db:generate` para gerar o client do Prisma

---

### 6️⃣ Testar Conexão

Rode o servidor:
```bash
npm run dev
```

Você deve ver:
```
✅ Server listening at http://0.0.0.0:3001
✅ Prisma connected to database
```

Teste o health check:
```bash
curl http://localhost:3001/
```

Resposta esperada:
```json
{
  "status": "ok",
  "message": "VIU Backend API rodando!",
  "timestamp": "2026-02-02T..."
}
```

---

### 7️⃣ Testar Login (Admin de Teste)

O script criou um usuário admin automático:

**Email:** `admin@viu.com`
**Senha:** `Admin@123456`

Teste o login:
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@viu.com",
    "senha": "Admin@123456"
  }'
```

Resposta esperada:
```json
{
  "token": "c1234567890abcdef:abc123...",
  "usuario": {
    "id": "c...",
    "email": "admin@viu.com",
    "nome": "Admin VIU",
    "tipo": "ADMIN"
  },
  "success": true
}
```

---

## 🔍 Verificar Tabelas no Supabase

Para ver se tudo foi criado corretamente:

1. Vá em: **Table Editor** (menu lateral)
2. Você deve ver 11 tabelas:
   - ✅ usuarios
   - ✅ projetos
   - ✅ artes
   - ✅ feedbacks
   - ✅ aprovacoes
   - ✅ tarefas
   - ✅ notificacoes
   - ✅ sessoes
   - ✅ audit_logs
   - ✅ security_events

---

## 🐛 Troubleshooting

### Erro: "connection refused"
- Verifique se a DATABASE_URL está correta
- Confirme se o projeto Supabase não está pausado
- Teste a conexão no SQL Editor do Supabase

### Erro: "password authentication failed"
- A senha na DATABASE_URL está incorreta
- Substitua `[PASSWORD]` pela senha real (sem colchetes!)

### Erro: "relation does not exist"
- Execute o `supabase-schema.sql` novamente
- Ou rode `npm run db:push` para criar as tabelas

### Erro: "Prisma Client not generated"
```bash
npm run db:generate
```

### Projeto Supabase Pausou
- Supabase Free tier pausa após 7 dias de inatividade
- Vá no dashboard e clique em **"Restore"**
- Ou faça upgrade para Pro ($25/mês)

---

## 🔒 Segurança

⚠️ **NUNCA comite o arquivo `.env` no Git!**

O `.gitignore` já está configurado para ignorá-lo, mas sempre confira:

```bash
# Verificar se .env está no .gitignore
cat .gitignore | grep .env
```

---

## 📊 Monitoramento

Para ver logs do banco de dados:

1. Vá em: **Logs > Postgres Logs**
2. Veja queries em tempo real
3. Identifique queries lentas

Para ver uso:

1. Vá em: **Settings > Usage**
2. Veja:
   - Database size
   - Bandwidth
   - API requests

---

## 🎯 Próximos Passos

Agora que o Supabase está configurado:

1. ✅ Testar todas as rotas da API
2. ✅ Criar mais usuários de teste
3. ✅ Configurar Storage para upload de artes
4. ✅ Configurar RLS (Row Level Security) se necessário
5. ✅ Fazer backup regular do banco

---

## 📚 Recursos Úteis

- [Supabase Docs](https://supabase.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [Guia de Conexão](https://supabase.com/docs/guides/database/connecting-to-postgres)

---

**Pronto! Seu Supabase está configurado e rodando! 🎉**
