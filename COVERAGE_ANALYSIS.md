# Análise de Cobertura de Testes e Melhorias - VIU Backend

## Resumo da Cobertura

| Camada | Statements | Branches | Functions | Lines |
|--------|-----------|----------|-----------|-------|
| **Global** | **39.28%** | **58.47%** | **67.53%** | **39.28%** |
| src/schemas | 100% | 100% | 100% | 100% |
| src/types | 100% | 100% | 100% | 100% |
| src/utils | 100% | 100% | 100% | 100% |
| src/middleware (auth) | 100% | 100% | 100% | 100% |
| src/services | 87.77% | 59.52% | 88.09% | 87.77% |
| src/controllers | 0% | 0% | 0% | 0% |
| src/routes | 0% | 0% | 0% | 0% |

**Total de testes:** 122 (todos passando)
**Arquivos de teste:** 12

---

## Camadas sem cobertura

### Controllers (0%) - 8 arquivos
Os controllers não estão cobertos pois dependem de `FastifyRequest`/`FastifyReply`. Para testá-los é necessário testes de integração com o servidor Fastify (via `inject`).

### Routes (0%) - 9 arquivos
As definições de rota são simples mapeamentos HTTP e seriam cobertas por testes de integração E2E.

### Middlewares restantes (0%) - projetoMiddleware e usuarioMiddleware
Necessitam de mocks mais elaborados de request/reply do Fastify.

---

## Melhorias Identificadas no Código

### 1. Segurança

| Problema | Arquivo | Severidade |
|----------|---------|------------|
| **Uso excessivo de `any`** em parâmetros de services (`createUsuario(userData: any)`, `createProjeto(projetoData: any)`, etc.) | Todos os services | Alta |
| **Schemas Zod não utilizados nos controllers** - Os schemas de validação existem em `validation.ts` mas não são aplicados como middleware nas rotas | controllers/*.ts, routes/*.ts | Alta |
| **Token de sessão buscado com `findUnique({ where: { token } })`** - Consulta por token em texto. Ideal seria armazenar hash do token | authMiddleware.ts:18 | Média |
| **Sessões expiradas não são limpas** - Não há rotina de cleanup de sessões expiradas no banco | sessaoService.ts | Baixa |
| **`error.message` exposto na resposta HTTP** no catch do authMiddleware | authMiddleware.ts:32-36 | Média |

### 2. Tipagem

| Problema | Arquivo | Impacto |
|----------|---------|---------|
| `(request as any).usuario` - Cast forçado sem type augmentation do Fastify | authMiddleware.ts:30 | Os controllers precisam usar `(request as any).usuario` em vez de tipagem segura |
| `const where: any = {}` repetido em todos os services | Todos os services | Perde-se validação de tipo nas queries Prisma |
| Parâmetros `userData: any`, `updateData: any` em todos os services | services/*.ts | As interfaces Zod existem mas não são usadas nos types dos parâmetros |

### 3. Arquitetura

| Problema | Descrição |
|----------|-----------|
| **Dois servidores (Fastify + Express)** | `src/index.ts` usa Fastify e `src/server.ts` usa Express. Isso causa confusão e duplicação |
| **`@fastify/helmet`, `@fastify/rate-limit`, `@fastify/jwt`** instalados mas não registrados em `index.ts` | Dependências pagas mas não utilizadas |
| **Formatação de dados na camada de service** | `formatCurrency` e `formatDate` são chamados no service. Formatação deveria ser responsabilidade do frontend ou de uma camada de serialização |
| **Sem tratamento de erro centralizado** | Cada controller faz `try/catch` individual. Um error handler global no Fastify simplificaria o código |

### 4. Performance

| Problema | Arquivo |
|----------|---------|
| **N+1 potencial em `dashboardStats`** | projetoService.ts:319-346 - 7 queries paralelas poderiam ser reduzidas |
| **`Number(limit)` desnecessário** | Vários services - `limit` já é tipado como `number` na interface |
| **Sem índices para buscas textuais** | `contains: search` sem index full-text no Prisma schema |

### 5. Código duplicado

| Padrão repetido | Ocorrências |
|-----------------|-------------|
| Lógica de conversão `ativo: string \| boolean` → `boolean` | usuarioService.ts, sessaoService.ts, notificacaoService.ts |
| Padrão find-then-throw em delete/update (`findUnique` seguido de `throw`) | Todos os 8 services |
| Formatação condicional `orcamentoFormatado`, `prazoFormatado` | projetoService.ts (4 vezes) |

---

## Recomendações Priorizadas

1. **Aplicar schemas Zod como validação nas rotas** - Conectar os schemas de `validation.ts` ao pipeline do Fastify
2. **Substituir `any` por tipos Zod inferidos nos services** - Usar `CreateUsuarioRequest`, `UpdateProjetoRequest`, etc.
3. **Remover o servidor Express** (`server.ts`) ou consolidar em um único framework
4. **Registrar plugins de segurança** (`@fastify/helmet`, `@fastify/rate-limit`) em `index.ts`
5. **Implementar error handler global** no Fastify com `setErrorHandler`
6. **Extrair lógica de parsing de boolean de query params** para utilitário compartilhado
7. **Adicionar testes de integração** usando `app.inject()` do Fastify para cobrir controllers e routes
8. **Declarar tipos Fastify augmentation** para `request.usuario` em vez de cast com `any`
