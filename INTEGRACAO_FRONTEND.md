# 🔄 Integração Backend-Frontend - Guia de Migração

## 📋 Resumo das Mudanças

Este documento descreve as mudanças implementadas no backend VIU para melhorar a integração com o frontend.

### ✅ Problema Resolvido

Anteriormente, o backend rodava **dois servidores separados**:
- **Servidor Fastify** (porta 3001) - API principal
- **Servidor Express** (porta 3333) - Endpoints de storage de arquivos

Isso causava confusão e dificuldade na integração do frontend, pois era necessário configurar e se conectar a duas URLs diferentes.

### ✅ Solução Implementada

**Todos os endpoints foram unificados em um único servidor Fastify na porta 3001.**

## 🔐 Autenticação — sessão por cookie

`POST /auth/login`, `POST /auth/2fa/login` e `POST /auth/refresh` gravam a sessão em dois
cookies `HttpOnly`: `viu_token` (acesso) e `viu_refresh_token`. O token **não volta no corpo
da resposta** — é o que impede um XSS de ler a credencial e usá-la fora da sessão do
navegador. O corpo devolve só `{ usuario }`.

No cliente, isso significa:

```js
fetch(`${API_URL}/projetos`, { credentials: 'include' })  // sem header Authorization
```

- `credentials: 'include'` é obrigatório em toda chamada ao backend; o navegador anexa o
  cookie sozinho e o JavaScript nunca vê o valor.
- `POST /auth/logout` revoga a sessão no servidor e apaga os cookies.
- `POST /auth/refresh` não precisa de corpo: o refresh token vem do cookie. Se falhar,
  os cookies são apagados — a sessão acabou, mande para o login.

**Escrita autenticada por cookie exige `Origin` conhecido** (403 caso contrário). É a defesa
contra CSRF quando o deploy obriga `SameSite=none`. Requisições do próprio app já mandam
`Origin`; chamadas server-side precisam mandá-lo explicitamente (ver `lib/serverBackend.ts`
no frontend).

`Authorization: Bearer {token}` continua aceito para clientes que não são navegador —
scripts, integrações e os testes. Os exemplos abaixo usam essa forma.

Variáveis relevantes: `COOKIE_SAMESITE` (`lax` quando app e API compartilham o site
registrável; `none` + HTTPS quando estão em domínios diferentes) e `COOKIE_DOMAIN` (opcional,
para compartilhar o cookie entre subdomínios).

---

## 🎯 Novos Endpoints Disponíveis

### 1. Links Compartilhados

#### Criar Link Compartilhado
```http
POST /links
Authorization: Bearer {token}
Content-Type: application/json

{
  "arteId": "clxxxxx",
  "expiraEm": "2026-12-31T23:59:59.000Z",  // Opcional
  "somenteLeitura": true                     // Opcional, padrão: true
}
```

**Resposta:**
```json
{
  "message": "Link compartilhado criado com sucesso",
  "data": {
    "url": "http://localhost:3001/preview/a1b2c3d4e5f6...",
    "token": "a1b2c3d4e5f6..."
  },
  "success": true
}
```

#### Acessar Preview Público (sem autenticação)
```http
GET /preview/{token}
```

**Resposta:**
```json
{
  "data": {
    "somenteLeitura": true,
    "arte": {
      "id": "clxxxxx",
      "nome": "Logo v2",
      "arquivo": "artes/projeto123/logo.png",
      "arquivo_url": "https://<account_id>.r2.cloudflarestorage.com/viu/artes/...?X-Amz-Signature=...",
      "projeto": { "nome": "Projeto ABC" },
      "autor": { "nome": "Designer", "email": "designer@viu.com" }
    },
    "feedbacks": [
      {
        "id": "fbxxxxx",
        "conteudo": "Comentário...",
        "tipo": "TEXTO",
        "autor": { "nome": "Cliente", "email": "cliente@viu.com" }
      },
      {
        "id": "fbxxxxx",
        "tipo": "AUDIO",
        "arquivo": "audios/user123/feedback.webm",
        "arquivo_url": "https://<account_id>.r2.cloudflarestorage.com/viu/feedbacks/...?X-Amz-Signature=...",
        "transcricao": "Texto transcrito do áudio"
      }
    ]
  },
  "success": true
}
```

### 2. Endpoints de Artes Atualizados

#### Buscar Arte (agora retorna URLs assinadas)
```http
GET /artes/{id}
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "data": {
    "id": "clxxxxx",
    "nome": "Logo",
    "arquivo": "artes/projeto123/logo.png",
    "arquivo_url": "https://<account_id>.r2.cloudflarestorage.com/viu/artes/...?X-Amz-Signature=...",
    "feedbacks": [
      {
        "tipo": "AUDIO",
        "arquivo": "audios/user123/feedback.webm",
        "arquivo_url": "https://<account_id>.r2.cloudflarestorage.com/viu/feedbacks/...?X-Amz-Signature=..."
      }
    ]
  },
  "success": true
}
```

### 3. Endpoints de Feedbacks Atualizados

#### Listar Feedbacks (agora retorna URLs assinadas para áudios)
```http
GET /feedbacks?arteId={arteId}
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "data": [
    {
      "id": "fbxxxxx",
      "tipo": "AUDIO",
      "arquivo": "audios/user123/feedback.webm",
      "arquivo_url": "https://<account_id>.r2.cloudflarestorage.com/viu/feedbacks/...?X-Amz-Signature=...",
      "transcricao": "Texto transcrito"
    }
  ],
  "success": true
}
```

#### Criar Feedback com Áudio
```http
POST /feedbacks/audio
Authorization: Bearer {token}
Content-Type: multipart/form-data

Fields:
- audio: arquivo de áudio (webm, ogg, mp3, wav, m4a)
- arteId: ID da arte
- posicaoX: (opcional) coordenada X (0-1)
- posicaoY: (opcional) coordenada Y (0-1)
```

## 🔧 Como Atualizar o Frontend

### 1. Atualizar a URL Base da API

**Antes:**
```javascript
// Duas URLs diferentes
const API_URL = 'http://localhost:3001'           // API principal
const STORAGE_API_URL = 'http://localhost:3333'    // Storage/links
```

**Depois:**
```javascript
// Uma única URL
const API_URL = 'http://localhost:3001'
```

### 2. Atualizar Chamadas para Artes

**Antes:**
```javascript
// Buscar arte
const arte = await fetch(`${API_URL}/artes/${id}`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json())

// Usar arquivo (sem URL assinada)
const imgSrc = arte.data.arquivo  // URL direta, pode não funcionar
```

**Depois:**
```javascript
// Buscar arte
const arte = await fetch(`${API_URL}/artes/${id}`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json())

// Usar arquivo_url (URL assinada do R2)
const imgSrc = arte.data.arquivo_url  // URL assinada, válida por 1 hora
```

### 3. Implementar Links Compartilhados

```javascript
// Criar link compartilhado
async function createShareableLink(arteId) {
  const response = await fetch(`${API_URL}/links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      arteId,
      expiraEm: '2026-12-31T23:59:59.000Z',  // Opcional
      somenteLeitura: true
    })
  })
  
  const result = await response.json()
  return result.data.url  // URL pública para compartilhar
}

// Acessar preview público (sem autenticação)
async function getPublicPreview(token) {
  const response = await fetch(`${API_URL}/preview/${token}`)
  const result = await response.json()
  return result.data  // { arte, feedbacks, somenteLeitura }
}
```

### 4. Upload de Feedback com Áudio

```javascript
async function uploadAudioFeedback(arteId, audioBlob, position = null) {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'feedback.webm')
  formData.append('arteId', arteId)
  
  if (position) {
    formData.append('posicaoX', position.x)
    formData.append('posicaoY', position.y)
  }
  
  const response = await fetch(`${API_URL}/feedbacks/audio`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
  
  const result = await response.json()
  return result.data  // Feedback com arquivo_url e transcricao
}
```

## 📝 Configuração do storage (Cloudflare R2)

Artes e áudios ficam num bucket R2 único (`viu`, por padrão), separados por
prefixo de chave — `artes/...` e `feedbacks/...`. Não há bucket por tipo de
arquivo, e o cliente nunca escolhe o caminho: a chave é montada no backend a
partir de um UUID.

Variáveis de ambiente no backend:
```env
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<r2_access_key_id>
R2_SECRET_ACCESS_KEY=<r2_secret_access_key>
R2_BUCKET=viu
APP_URL=http://localhost:3001
```

## 🔒 URLs Assinadas

O backend retorna `arquivo_url` para todos os arquivos armazenados no R2:

- **Validade:** 1 hora (3600 segundos)
- **Formato:** `https://<account_id>.r2.cloudflarestorage.com/viu/<chave>?X-Amz-Signature=...`
- **Uso:** Direto em `<img>`, `<audio>`, `<video>` ou download

**Importante:**
- URLs assinadas expiram após 1 hora
- Se precisar de acesso mais longo, refaça a requisição para obter nova URL
- Um `arquivo` que já seja URL absoluta **não** é assinado: `signPath` devolve
  `null` nesse caso, para que um valor vindo do banco não vire redirect para
  fora do bucket

## 🎯 Benefícios da Unificação

1. ✅ **Configuração simplificada** - uma única URL para toda a API
2. ✅ **CORS unificado** - configuração de segurança em um único lugar
3. ✅ **Autenticação consistente** - mesmo sistema de Bearer Token
4. ✅ **Logs centralizados** - todos os logs em um único servidor
5. ✅ **Deploy mais simples** - apenas um processo para gerenciar
6. ✅ **URLs assinadas automáticas** - segurança melhorada para arquivos

## 🚀 Próximos Passos

1. Atualizar o frontend para usar a API unificada
2. Implementar a funcionalidade de links compartilhados
3. Testar upload de áudios com transcrição
4. Configurar o bucket R2
5. Atualizar documentação do frontend

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- README.md do backend
- Documentação do Cloudflare R2
- Logs do servidor (porta 3001)
