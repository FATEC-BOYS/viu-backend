# 🔗 Integração Supabase + Prisma Backend

Este guia explica como integrar a autenticação do Supabase (frontend) com o backend Prisma (Railway).

## 🎯 Visão Geral

- **Frontend**: Usa Supabase para autenticação (Google, GitHub, etc)
- **Backend**: Usa Prisma + PostgreSQL no Railway para dados da aplicação
- **Sincronização**: Endpoint para sincronizar usuários entre os dois sistemas

## 🔐 Fluxo de Autenticação

```
1. Usuário faz login com Google no frontend (Supabase)
2. Frontend recebe dados do usuário do Supabase
3. Frontend chama endpoint /auth/supabase/sync no backend
4. Backend cria/atualiza usuário no banco Prisma
5. Frontend pode fazer chamadas para APIs do backend
```

## 📝 Como Implementar no Frontend

### 1. Após Login no Supabase

Quando o usuário fizer login com Google (ou outro provider), chame o endpoint de sincronização:

```javascript
// Exemplo com Supabase Auth
import { supabase } from './supabaseClient'

async function handleGoogleLogin() {
  // 1. Login com Supabase
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  })

  if (error) {
    console.error('Erro no login:', error)
    return
  }

  // 2. Pegar dados do usuário
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // 3. Sincronizar com backend
    await syncUserWithBackend(user)
  }
}

async function syncUserWithBackend(supabaseUser) {
  const API_URL = import.meta.env.VITE_API_URL // ou process.env.NEXT_PUBLIC_API_URL

  try {
    const response = await fetch(`${API_URL}/auth/supabase/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supabaseId: supabaseUser.id,
        email: supabaseUser.email,
        nome: supabaseUser.user_metadata.full_name || supabaseUser.email.split('@')[0],
        avatar: supabaseUser.user_metadata.avatar_url,
        provider: supabaseUser.app_metadata.provider, // 'google', 'github', etc
      }),
    })

    const data = await response.json()

    if (data.success) {
      console.log('✅ Usuário sincronizado:', data.data)
      // Salvar ID do usuário no Prisma para uso posterior
      localStorage.setItem('prismaUserId', data.data.id)
    } else {
      console.error('❌ Erro ao sincronizar:', data.message)
    }
  } catch (error) {
    console.error('❌ Erro na requisição:', error)
  }
}
```

### 2. Hook de Autenticação (React)

Crie um hook para gerenciar a autenticação:

```javascript
// hooks/useAuth.js
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const API_URL = import.meta.env.VITE_API_URL

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncUser(session.user)
      }
      setLoading(false)
    })

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await syncUser(session.user)
        } else {
          setUser(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function syncUser(supabaseUser) {
    try {
      const response = await fetch(`${API_URL}/auth/supabase/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseId: supabaseUser.id,
          email: supabaseUser.email,
          nome: supabaseUser.user_metadata.full_name || supabaseUser.email.split('@')[0],
          avatar: supabaseUser.user_metadata.avatar_url,
          provider: supabaseUser.app_metadata.provider,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setUser(data.data)
        localStorage.setItem('prismaUserId', data.data.id)
      }
    } catch (error) {
      console.error('Erro ao sincronizar usuário:', error)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    })
    if (error) console.error('Erro no login:', error)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    localStorage.removeItem('prismaUserId')
  }

  return { user, loading, signInWithGoogle, signOut }
}
```

### 3. Usando o Hook no Componente

```javascript
// App.jsx ou Login.jsx
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, loading, signInWithGoogle, signOut } = useAuth()

  if (loading) {
    return <div>Carregando...</div>
  }

  return (
    <div>
      {user ? (
        <div>
          <h1>Bem-vindo, {user.nome}!</h1>
          <img src={user.avatar} alt={user.nome} />
          <p>Email: {user.email}</p>
          <button onClick={signOut}>Sair</button>
        </div>
      ) : (
        <div>
          <h1>Faça Login</h1>
          <button onClick={signInWithGoogle}>
            Entrar com Google
          </button>
        </div>
      )}
    </div>
  )
}
```

## 🔄 Endpoints Disponíveis

### POST /auth/supabase/sync

Sincroniza usuário do Supabase com o banco Prisma.

**Request:**
```json
{
  "supabaseId": "uuid-do-supabase",
  "email": "usuario@example.com",
  "nome": "Nome do Usuário",
  "avatar": "https://...",
  "provider": "google"
}
```

**Response (201 - Criado):**
```json
{
  "message": "Usuário criado com sucesso",
  "data": {
    "id": "cuid-do-prisma",
    "email": "usuario@example.com",
    "nome": "Nome do Usuário",
    "avatar": "https://...",
    "tipo": "DESIGNER"
  },
  "success": true
}
```

**Response (200 - Atualizado):**
```json
{
  "message": "Usuário atualizado com sucesso",
  "data": { ... },
  "success": true
}
```

### GET /auth/supabase/user/:supabaseId

Busca usuário pelo supabaseId.

**Response:**
```json
{
  "data": {
    "id": "cuid",
    "email": "usuario@example.com",
    "nome": "Nome",
    "avatar": "https://...",
    "tipo": "DESIGNER",
    "telefone": null,
    "ativo": true,
    "criadoEm": "2024-01-01T00:00:00.000Z"
  },
  "success": true
}
```

## 🗄️ Schema Atualizado

O schema do Prisma foi atualizado para suportar login social:

```prisma
model Usuario {
  id       String  @id @default(cuid())
  email    String  @unique
  senha    String? // ✅ Agora opcional (para login social)
  nome     String

  // ✅ Novos campos para integração Supabase
  supabaseId String? @unique
  provider   String? // "google", "github", etc.

  // ... outros campos
}
```

## 🚀 Fazer Chamadas para Outras APIs

Depois de sincronizar, você pode fazer chamadas para outras APIs do backend:

```javascript
const API_URL = import.meta.env.VITE_API_URL
const prismaUserId = localStorage.getItem('prismaUserId')

// Exemplo: Criar um projeto
async function createProject(projectData) {
  const response = await fetch(`${API_URL}/projetos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...projectData,
      designerId: prismaUserId, // Usar o ID do Prisma
    }),
  })

  return response.json()
}

// Exemplo: Listar projetos do usuário
async function getUserProjects() {
  const response = await fetch(
    `${API_URL}/projetos?designerId=${prismaUserId}`
  )
  return response.json()
}
```

## ✅ Checklist de Integração

### Backend (Railway)
- [x] Schema atualizado (senha opcional, supabaseId)
- [x] Endpoint de sincronização criado
- [x] Rotas registradas
- [ ] Fazer migrate/push do schema
- [ ] Deploy no Railway

### Frontend (Vercel)
- [ ] Configurar `VITE_API_URL` no Vercel
- [ ] Implementar hook useAuth
- [ ] Chamar endpoint de sincronização após login
- [ ] Salvar prismaUserId no localStorage
- [ ] Usar prismaUserId nas chamadas de API

## 🐛 Troubleshooting

**Erro: "null value in column 'senha'"**
- ✅ Resolvido: Campo senha agora é opcional (`senha String?`)

**Erro: "Could not find relationship 'cliente_id'"**
- O Prisma usa camelCase (`clienteId`), não snake_case (`cliente_id`)
- Certifique-se de usar as APIs do backend, não queries diretas no Supabase

**Usuário não aparece no banco:**
- Verifique se o endpoint de sincronização está sendo chamado
- Veja os logs do Railway
- Teste o endpoint diretamente com Postman/curl

## 📚 Próximos Passos

1. Fazer migrate do schema:
   ```bash
   npx prisma db push
   ```

2. Deploy no Railway

3. Atualizar frontend para chamar o endpoint de sincronização

4. Testar fluxo completo de autenticação

## 💬 Dúvidas?

Se tiver problemas, verifique:
- Logs do Railway (backend)
- Console do navegador (frontend)
- Variáveis de ambiente (VITE_API_URL, ALLOWED_ORIGINS)
