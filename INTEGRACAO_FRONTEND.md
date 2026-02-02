# 🔄 Integração Backend-Frontend - Guia de Migração

## 📋 Resumo das Mudanças

Este documento descreve as mudanças implementadas no backend VIU para melhorar a integração com o frontend.

### ✅ Problema Resolvido

Anteriormente, o backend rodava **dois servidores separados**:
- **Servidor Fastify** (porta 3001) - API principal
- **Servidor Express** (porta 3333) - Endpoints de Supabase Storage

Isso causava confusão e dificuldade na integração do frontend, pois era necessário configurar e se conectar a duas URLs diferentes.

### ✅ Solução Implementada

**Todos os endpoints foram unificados em um único servidor Fastify na porta 3001.**

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
      "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/artes/...",
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
        "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/audios/...",
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
    "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/artes/...",
    "feedbacks": [
      {
        "tipo": "AUDIO",
        "arquivo": "audios/user123/feedback.webm",
        "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/audios/..."
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
      "arquivo_url": "https://xxxxx.supabase.co/storage/v1/object/sign/audios/...",
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
const SUPABASE_API_URL = 'http://localhost:3333'   // Storage/links
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

// Usar arquivo_url (com URL assinada do Supabase)
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

## 📝 Configuração do Supabase

Para usar os recursos de storage (artes e áudios), configure o Supabase:

1. Crie buckets no Supabase Storage:
   - `artes` - para arquivos de artes
   - `audios` - para feedbacks de áudio

2. Configure as variáveis de ambiente no backend:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
APP_URL=http://localhost:3001
```

## 🔒 URLs Assinadas

O backend agora retorna `arquivo_url` para todos os arquivos armazenados no Supabase Storage:

- **Válidade:** 1 hora (3600 segundos)
- **Formato:** `https://xxxxx.supabase.co/storage/v1/object/sign/bucket/path?token=...`
- **Uso:** Direto em `<img>`, `<audio>`, `<video>` ou download

**Importante:** 
- URLs assinadas expiram após 1 hora
- Se precisar de acesso mais longo, refaça a requisição para obter nova URL
- URLs regulares (http/https) não são modificadas

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
4. Configurar os buckets do Supabase Storage
5. Atualizar documentação do frontend

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- README.md do backend
- Documentação do Supabase
- Logs do servidor (porta 3001)
