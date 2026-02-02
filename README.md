# 🚀 VIU Backend

Backend da plataforma VIU – uma API REST construída com Fastify, TypeScript, Prisma e integração com viu‑shared para validação e formatação de dados. A aplicação fornece uma camada robusta para gerenciar designers, clientes, projetos e todas as entidades relacionadas, com autenticação baseada em sessões e middlewares pensados em segurança.

## 📋 Índice

- [🎯 Sobre](#-sobre)
- [⚡ Quick Start](#-quick-start)
- [🗄️ Banco de Dados](#️-banco-de-dados)
- [🛣️ APIs Disponíveis](#️-apis-disponíveis)
- [🧪 Testes](#-testes)
- [🔧 Desenvolvimento](#-desenvolvimento)
- [📊 Monitoramento](#-monitoramento)

## 🎯 Sobre

O VIU Backend é uma API completa para a plataforma VIU, oferecendo:

- ✅ Autenticação via sessões (tokens) com middleware de verificação
- ✅ CRUD completo de usuários, projetos, artes, feedbacks, aprovações, tarefas, notificações e sessões
- ✅ Validação automática com viu‑shared + Zod
- ✅ Formatação brasileira (moeda, telefone, CPF, datas)
- ✅ Banco de dados otimizado com Prisma
- ✅ Rate limiting e segurança com CORS e Helmet
- ✅ Hot reload para desenvolvimento
- ✅ **Integração com Supabase Storage** para armazenamento de arquivos (artes e áudios)
- ✅ **URLs assinadas** para acesso seguro a arquivos no Supabase
- ✅ **Links compartilhados** para preview público de artes sem autenticação
- ✅ **Upload de áudio** com transcrição automática via OpenAI Whisper
- ✅ **API unificada** em uma única porta (3001)

## ⚡ Quick Start

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar banco de dados
```bash
# Gerar cliente Prisma
npm run db:generate

# Criar banco e tabelas
npm run db:push

# Popular com dados de teste
npm run db:seed
```

### 2.1 Configurar variáveis de ambiente
```bash
# Copie o exemplo e ajuste os valores
cp .env.example .env
```

### 3. Rodar servidor
```bash
npm run dev
```

### 4. Testar
```bash
# Abrir no navegador
http://localhost:3001/

# Teste completo do viu-shared
http://localhost:3001/test/all
```

## 🗄️ Banco de Dados

### 📊 Schema (8 tabelas)

| Tabela | Descrição |
|--------|-----------|
| `usuarios` | Designers, clientes e administradores |
| `projetos` | Projetos com designer e cliente |
| `artes` | Upload e versionamento de arquivos |
| `feedbacks` | Comentários (texto/áudio/posicional) |
| `aprovacoes` | Processo de aprovação de artes |
| `tarefas` | Tarefas vinculadas a projetos |
| `notificacoes` | Sistema de notificações por usuário |
| `sessoes` | Controle de autenticação |

### 🌱 Dados de Teste

```bash
# Logins disponíveis:
Designer: designer@viu.com | 123456
Cliente:  cliente1@empresa.com | 123456
Admin:    admin@viu.com | 123456
```

### 📊 Visualizar dados
```bash
npm run db:studio
# Abre: http://localhost:5555
```

## 🛣️ APIs Disponíveis

> **Nota:** Todos os endpoints, exceto os de `/test/*` e `/auth/login`, exigem autenticação via Bearer Token obtido no login.

### 🧪 Testes (viu‑shared)
- `GET /test/all` - Teste completo das funcionalidades de formatação/validação
- `GET /test/currency` - Formatação de moeda
- `GET /test/phone` - Formatação de telefone
- `GET /test/cpf` - Validação de CPF
- `POST /test/validate-user` - Validação de usuário via schema

### 👤 Usuários
- `GET /usuarios` - Listar (paginado) e filtrar por tipo/ativo
- `GET /usuarios/:id` - Buscar por ID
- `POST /usuarios` - Criar usuário (validação + hash de senha)
- `PUT /usuarios/:id` - Atualizar usuário
- `DELETE /usuarios/:id` - Desativar usuário (soft delete)
- `POST /auth/login` - Login e criação de sessão (token)
- `GET /usuarios/stats/overview` - Visão geral de estatísticas de usuários

### 📁 Projetos
- `GET /projetos` - Listar com filtros e paginação
- `GET /projetos/:id` - Detalhar projeto (designer, cliente, artes, tarefas)
- `POST /projetos` - Criar projeto (verifica existência de designer e cliente)
- `PUT /projetos/:id` - Atualizar projeto
- `DELETE /projetos/:id` - Remover projeto (se não houver artes/tarefas)
- `GET /projetos/stats/dashboard` - Dashboard com resumo e últimos projetos
- `GET /designers/:id/projetos` - Projetos por designer

### 🎨 Artes
- `GET /artes` - Listar artes (filtro por projeto, autor, tipo, status)
- `GET /artes/:id` - Buscar arte com feedbacks e aprovações (inclui URLs assinadas do Supabase Storage)
- `POST /artes` - Criar arte (requere projeto e autenticação)
- `PUT /artes/:id` - Atualizar arte (nome, descrição, status, etc.)
- `DELETE /artes/:id` - Remover arte

### 💬 Feedbacks
- `GET /feedbacks` - Listar feedbacks (filtro por arte/autor/tipo, inclui URLs assinadas para áudios)
- `GET /feedbacks/:id` - Buscar feedback (inclui URL assinada se for áudio)
- `POST /feedbacks` - Criar feedback (associa autor e arte)
- `POST /feedbacks/audio` - Criar feedback com áudio (upload multipart, transcrição automática)
- `GET /feedbacks/:id/audio` - Gerar áudio TTS a partir do texto do feedback
- `GET /feedbacks/:id/transcricao` - Obter transcrição de um feedback de áudio
- `PUT /feedbacks/:id` - Atualizar feedback
- `DELETE /feedbacks/:id` - Remover feedback

### 🔗 Links Compartilhados
- `POST /links` - Criar link compartilhado para uma arte (requer autenticação)
- `GET /preview/:token` - Acessar arte via link compartilhado (sem autenticação, URLs assinadas)

### ✅ Aprovações
- `GET /aprovacoes` - Listar aprovações (filtro por arte/aprovador/status)
- `GET /aprovacoes/:id` - Buscar aprovação
- `POST /aprovacoes` - Criar aprovação (associa aprovador e arte)
- `PUT /aprovacoes/:id` - Atualizar aprovação (status/comentário)
- `DELETE /aprovacoes/:id` - Remover aprovação

### 📋 Tarefas
- `GET /tarefas` - Listar tarefas (filtro por projeto/responsável/status/prioridade)
- `GET /tarefas/:id` - Buscar tarefa
- `POST /tarefas` - Criar tarefa (verifica projeto e responsável)
- `PUT /tarefas/:id` - Atualizar tarefa
- `DELETE /tarefas/:id` - Remover tarefa

### 🔔 Notificações
- `GET /notificacoes` - Listar notificações do usuário autenticado
- `GET /notificacoes/:id` - Buscar notificação específica
- `POST /notificacoes` - Criar notificação (usado por serviços internos)
- `PUT /notificacoes/:id/lida` - Marcar como lida/não lida
- `DELETE /notificacoes/:id` - Remover notificação do usuário

### 🔐 Sessões
- `GET /sessoes` - Listar sessões ativas/inativas do usuário
- `DELETE /sessoes/:id` - Revogar sessão (logout)

### 📊 Informações
- `GET /` - Informações da API
- `GET /health` - Status do servidor e uptime

## 🧪 Testes

### Exemplos de Uso

#### 1. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "designer@viu.com",
  "senha": "123456"
}
```

**Resposta (resumida):**
```json
{
  "message": "Login realizado com sucesso",
  "data": {
    "token": "fake_jwt_token_...",
    "usuario": { "id": "...", "nome": "Designer", ... }
  },
  "success": true
}
```

#### 2. Criar Projeto
```http
POST /projetos
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "nome": "Logo Empresa X",
  "descricao": "Criação de identidade visual",
  "orcamento": 500000,
  "prazo": "2025-09-15T00:00:00.000Z",
  "designerId": "<id-do-designer>",
  "clienteId": "<id-do-cliente>"
}
```

#### 3. Criar Arte
```http
POST /artes
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "nome": "Mockup Produto",
  "descricao": "Primeira versão do mockup",
  "arquivo": "https://cdn.viu.com/arquivos/mockup.png",
  "tipo": "IMAGEM",
  "tamanho": 1048576,
  "projetoId": "<id-do-projeto>"
}
```

## 🔧 Desenvolvimento

### Scripts Disponíveis

```bash
npm run dev          # Desenvolvimento com hot reload
npm run build        # Build para produção
npm run start        # Rodar em produção
npm run lint         # Verificar estilo de código
npm run test         # Rodar testes

# Banco de dados:
npm run db:generate  # Gerar cliente Prisma
npm run db:push      # Aplicar schema
npm run db:seed      # Popular dados
npm run db:studio    # Interface visual
npm run db:reset     # Resetar banco
```

### Estrutura do Projeto

```
src/
├── controllers/           # Controladores de cada recurso
├── database/
│   ├── client.ts          # Instância do Prisma
│   └── seed.ts            # Dados de teste
├── middleware/
│   ├── authMiddleware.ts  # Autenticação baseada em sessão
│   └── ...
├── routes/                # Definições de rotas para cada recurso
│   ├── artes.ts
│   ├── feedbacks.ts
│   ├── aprovacoes.ts
│   ├── tarefas.ts
│   ├── notificacoes.ts
│   ├── sessoes.ts
│   ├── projetos.ts
│   ├── usuarios.ts
│   └── test.ts
├── services/              # Camada de serviços (lógica de negócio)
└── index.ts               # Servidor principal

prisma/
└── schema.prisma          # Definição do banco de dados

.env                       # Variáveis de ambiente
README.md                  # Este documento
```

### Variáveis de Ambiente

```bash
# .env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL="file:./dev.db"
JWT_SECRET="sua_chave_secreta"
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173"
SUPABASE_URL="https://<seu-projeto>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
APP_URL="http://localhost:3001"
OPENAI_API_KEY=""
```

### 🟩 Supabase

Para usar as rotas que dependem do Supabase (ex.: links compartilhados, storage de arquivos e feedbacks de áudio), é necessário criar um projeto no Supabase e obter as credenciais abaixo:

1. **Crie um projeto** em https://supabase.com e aguarde o provisionamento.
2. **Copie a URL do projeto** em **Project Settings → API → Project URL** e preencha `SUPABASE_URL`.
3. **Copie a Service Role Key** em **Project Settings → API → Service Role** e preencha `SUPABASE_SERVICE_ROLE_KEY`.
4. **Defina `APP_URL`** com a URL pública do seu backend (ou `http://localhost:3001` em desenvolvimento).
5. **Configure os buckets de storage** no Supabase:
   - Crie um bucket chamado `audios` para feedbacks de áudio
   - Configure as políticas de acesso conforme necessário

#### 🗄️ Supabase Storage

O backend utiliza o Supabase Storage para armazenar arquivos de artes e áudios de feedbacks. Os arquivos são armazenados com paths no formato `bucket/chave` e o backend gera URLs assinadas temporárias (válidas por 1 hora) para acesso seguro.

**Exemplo de uso:**
```json
// Criar arte com arquivo no Supabase
POST /artes
{
  "nome": "Logo v2",
  "arquivo": "artes/projeto123/logo-v2.png",  // Path no Supabase Storage
  "projetoId": "...",
  ...
}

// Resposta inclui URL assinada
GET /artes/:id
{
  "data": {
    "arquivo": "artes/projeto123/logo-v2.png",
    "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/artes/..."
  }
}
```

> ⚠️ **Importante:** a Service Role Key tem permissões elevadas. **Nunca** exponha essa chave no front-end.

## 📊 Monitoramento

### Health Check
```http
GET /health
```

### Logs
- **Desenvolvimento:** logs coloridos com pino-pretty
- **Produção:** logs estruturados em JSON

### Rate Limiting
- 100 requisições por minuto por IP (configurável via variáveis de ambiente)

### Segurança
- CORS habilitado (origem livre em desenvolvimento)
- Helmet para cabeçalhos de segurança
- Validação de entrada com Zod
- Hash de senhas com bcrypt

## 🎯 Recursos Implementados

### ✅ Funcionalidades Core

- ✅ Autenticação de usuários e sessões
- ✅ CRUD completo de usuários
- ✅ CRUD completo de projetos
- ✅ CRUD completo de artes
- ✅ CRUD completo de feedbacks
- ✅ CRUD completo de aprovações
- ✅ CRUD completo de tarefas
- ✅ CRUD completo de notificações
- ✅ CRUD e revogação de sessões
- ✅ Validação com viu‑shared
- ✅ Formatação brasileira
- ✅ Banco de dados otimizado
- ✅ Dados de seed realistas
- ✅ APIs de estatísticas
- ✅ Rate limiting
- ✅ Logs estruturados

### 🔄 Próximas Funcionalidades

- ⏳ Upload de arquivos (armazenamento em nuvem)
- ⏳ WebSockets para tempo real (feedback/atualizações instantâneas)
- ⏳ Cache com Redis
- ⏳ Testes automatizados completos
- ⏳ Deploy automatizado (CI/CD)

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m 'feat: adiciona nova funcionalidade'`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

## 📄 Licença

MIT License – veja LICENSE para mais detalhes.

---

**🚀 VIU Platform – Transformando a comunicação entre designers e clientes**
