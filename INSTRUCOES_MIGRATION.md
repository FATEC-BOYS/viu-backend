# 🚀 Instruções para Aplicar a Migration no Supabase

Este guia vai te ajudar a sincronizar o schema do Prisma com o banco de dados no Supabase e resolver os erros de relacionamento no frontend.

## 📋 Pré-requisitos

- Acesso ao painel do Supabase
- Backup dos dados (se houver dados importantes)

---

## 🔧 Passo 1: Configurar o arquivo .env

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edite o arquivo `.env` e configure a `DATABASE_URL`:
   - Acesse seu projeto no [Supabase](https://supabase.com/dashboard)
   - Vá em **Settings** → **Database**
   - Na seção **Connection string**, escolha **Transaction** mode
   - Copie a URI e substitua `[YOUR-PASSWORD]` pela senha do banco
   - Cole no arquivo `.env`:
     ```
     DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[SUA-SENHA]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
     ```

---

## 🗄️ Passo 2: Aplicar a Migration no Supabase

### Opção A: Via SQL Editor (Recomendado)

1. Acesse o painel do Supabase
2. Vá em **SQL Editor** (menu lateral esquerdo)
3. Clique em **New Query**
4. Abra o arquivo `migration-supabase.sql` que foi criado
5. Copie **TODO** o conteúdo do arquivo
6. Cole no SQL Editor do Supabase
7. Clique em **Run** (ou pressione `Ctrl + Enter`)

⚠️ **ATENÇÃO**: Este script vai **RECRIAR** todas as tabelas. Se você tem dados importantes, faça backup antes!

### Opção B: Via Prisma (Alternativa)

Se preferir usar o Prisma para gerenciar as migrations:

```bash
# 1. Criar a migration inicial
npm run db:migrate -- --name init

# 2. Aplicar a migration
npm run db:push
```

---

## 🔍 Passo 3: Verificar se os Relacionamentos foram Criados

1. No painel do Supabase, vá em **Table Editor**
2. Verifique se todas as tabelas foram criadas:
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
   - ✅ link_compartilhado

3. Clique em qualquer tabela e vá na aba **Relationships**
4. Verifique se os relacionamentos estão configurados (ex: `feedbacks.arteId` → `artes.id`)

---

## 🔐 Passo 4: Ajustar as Políticas RLS (Row Level Security)

As políticas RLS criadas são **básicas e temporárias**. Você deve ajustá-las conforme suas regras de negócio:

1. No Supabase, vá em **Authentication** → **Policies**
2. Revise cada tabela e ajuste as políticas conforme necessário
3. Exemplo de política mais restritiva para `notificacoes`:
   ```sql
   -- Usuários podem ver apenas suas próprias notificações
   CREATE POLICY "usuarios_veem_suas_notificacoes" 
     ON public.notificacoes FOR SELECT 
     USING (auth.uid()::text = "usuarioId");
   ```

---

## 🧪 Passo 5: Testar a Integração

1. **Gere o Prisma Client atualizado**:
   ```bash
   npm run db:generate
   ```

2. **Inicie o servidor backend**:
   ```bash
   npm run dev
   ```

3. **Teste as rotas no frontend**:
   - Login/Cadastro
   - Criar projeto
   - Upload de arte
   - Criar feedback
   - Listar notificações

---

## 🐛 Resolução de Problemas Comuns

### Erro: "senha" violates not-null constraint

**Causa**: O campo `senha` estava como obrigatório, mas agora é opcional (para login social).

**Solução**: A migration já corrigiu isso. Se o erro persistir, verifique se você está usando a versão mais recente do schema.

### Erro: "Could not find a relationship between..."

**Causa**: O Prisma Client não estava sincronizado com o banco.

**Solução**:
```bash
npm run db:generate
npm run dev
```

### Erro: "relation already exists"

**Causa**: As tabelas já existem no banco.

**Solução**: 
- Opção 1: Comente as linhas de `DROP TABLE` no SQL e execute apenas as partes que falharam
- Opção 2: Use `DROP TABLE IF EXISTS` (já está no script)

---

## 📊 Estrutura de Relacionamentos

```
usuarios (1) ──┬─→ (N) projetos (como designer)
               ├─→ (N) projetos (como cliente)
               ├─→ (N) artes
               ├─→ (N) feedbacks
               ├─→ (N) aprovacoes
               ├─→ (N) tarefas
               ├─→ (N) notificacoes
               └─→ (N) sessoes

projetos (1) ──┬─→ (N) artes
               └─→ (N) tarefas

artes (1) ──┬─→ (N) feedbacks
            ├─→ (N) aprovacoes
            └─→ (N) link_compartilhado
```

---

## 🎯 Próximos Passos

1. ✅ Aplicar a migration
2. ✅ Testar os relacionamentos
3. ⚠️ Ajustar as políticas RLS conforme suas regras de negócio
4. ⚠️ Criar índices adicionais se necessário (já incluídos no script)
5. ⚠️ Implementar validações no backend
6. ⚠️ Testar a integração com o frontend mobile

---

## 📞 Suporte

Se encontrar algum erro durante a migration:

1. Verifique os logs do SQL Editor no Supabase
2. Copie a mensagem de erro completa
3. Verifique se a `DATABASE_URL` está correta no `.env`
4. Certifique-se de que o Prisma Client foi regenerado: `npm run db:generate`

---

## 🔄 Reverter a Migration (se necessário)

Se algo der errado e você quiser reverter:

```sql
-- Execute no SQL Editor do Supabase
DROP TABLE IF EXISTS public.link_compartilhado CASCADE;
DROP TABLE IF EXISTS public.security_events CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.sessoes CASCADE;
DROP TABLE IF EXISTS public.notificacoes CASCADE;
DROP TABLE IF EXISTS public.tarefas CASCADE;
DROP TABLE IF EXISTS public.aprovacoes CASCADE;
DROP TABLE IF EXISTS public.feedbacks CASCADE;
DROP TABLE IF EXISTS public.artes CASCADE;
DROP TABLE IF EXISTS public.projetos CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
```

Depois, restaure o backup dos dados (se tiver).

---

**✨ Boa sorte com a migration!**
