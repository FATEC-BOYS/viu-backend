# Tech Debt

Decisões arquiteturais pendentes, riscos conhecidos e trabalho intencionalmente adiado.
Atualizar este arquivo ao abrir ou fechar um item. Cada entrada deve ter contexto suficiente
para que alguém novo entenda o problema sem ler o histórico de PRs.

---

## 🔴 Crítico

### Convite entre designer e cliente
**Risco:** qualquer usuário ativo do tipo correto pode ser adicionado a um projeto sem um fluxo
formal de aceite — um designer pode criar um projeto atribuindo qualquer cliente existente.

Contexto: há um `TODO(ux)` em `src/controllers/projetoController.ts:93` desde o MVP.
O campo `designerId`/`clienteId` é gravado diretamente sem que a outra parte confirme.

Solução esperada: tabela `Convite` com token de aceite, expiração e status. Ao criar projeto,
a parte ausente recebe e-mail; enquanto não aceita, o projeto fica em status `RASCUNHO` sem
acesso total.

---

### Revisão completa de autorização (IDOR)
**Risco:** troca de IDs em qualquer rota que receba `:id` pode expor recursos de outro cliente.

Rotas que precisam de auditoria explícita (testar com IDs de outro tenant):
- `GET/PUT/DELETE /artes/:id` — `src/middleware/authorizationMiddleware.ts`
- `GET/POST /feedbacks` filtrado por arteId
- `POST /aprovacoes` — verifica se `arteId` pertence ao projeto do caller?
- `GET /faturas/:id`, `POST /pagamentos/:id/pagar`
- `GET /saques/:id`
- `GET /links/:slug` — acesso público, mas o `projetoId` retornado pode vazar info
- `GET /equipes/:id` — atualmente protegido por `isMembro`, revisar casos de borda

Metodologia: criar dois tenants de teste, tentar cross-tenant em todas as rotas acima e
documentar o resultado. Usar `requireProjectAccess` como referência de padrão correto.

---

### Máquina de estados
**Risco:** um projeto em `CONCLUIDO` pode voltar para `EM_ANDAMENTO` por `PATCH /projetos/:id`;
uma arte em `APROVADO` pode ir para `RASCUNHO` sem log; uma fatura em `PAGO` pode ser marcada
como `CANCELADA`.

Locais afetados:
- `ProjetoStatus`: `RASCUNHO | EM_ANDAMENTO | REVISAO | CONCLUIDO | CANCELADO`
- `ArteStatus`: `RASCUNHO | EM_REVISAO | APROVADO | REJEITADO`
- `FaturaStatus`: `PENDENTE | PAGO | CANCELADO | VENCIDO`

Solução esperada: tabela de transições válidas (ex: `CONCLUIDO → EM_ANDAMENTO` = proibido) e
validação no service antes de qualquer `update`. Pode ser um `Map<Status, Status[]>` simples.

---

### Webhooks do Mercado Pago
**Risco:** replay attacks, processamento duplicado e callbacks falsos podem marcar faturas como
pagas sem recebimento real.

Itens pendentes:
1. Verificar assinatura HMAC-SHA256 do header `x-signature` antes de qualquer processamento
2. Guardar `externalId` (MP notification_id) e rejeitar com 200 se já processado (idempotência)
3. Responder 200 imediatamente e processar em background (MP retry em falha de resposta)
4. Log de cada webhook recebido: payload, status de processamento, timestamp

Localização atual: `src/controllers/pagamentoController.ts` (handler de webhook).

---

### Ledger financeiro
**Risco:** há pagamentos, faturas e saques como entidades separadas sem uma fonte única da
verdade para saldo disponível. É possível solicitar saque de um valor que ainda não foi
liquidado pelo gateway.

Verificar:
- Saldo disponível = soma de `Pagamento.valor` (status `PAGO`) − `Saque.valor` (status `PROCESSADO`)
- Essa conta é feita na hora do saque ou existe um campo materializado?
- O que acontece se dois saques simultâneos passam pela mesma janela de saldo?

Solução esperada: campo `saldoDisponivel` atualizado atomicamente via `$transaction` Prisma,
ou fila serializada de operações financeiras.

---

## 🟠 Alto

### Monitoramento de erro (Sentry ou equivalente)
**Status:** avaliado, adiado de propósito. O pré-requisito foi resolvido.

Não há nenhuma ferramenta de APM/error tracking. O único sinal é o log do pino no stdout do
processo, o que significa: sem alerta, sem agrupamento, sem histórico depois que o container
recicla, e sem stack trace do lado do navegador.

A avaliação encontrou um problema anterior a isso. 46 dos 53 blocos `catch` dos controllers
descartavam o erro e devolviam um 500 genérico sem registrar nada; eles nunca chegavam ao
`setErrorHandler` global, que é exatamente onde o SDK do Sentry se plugaria. Instalar Sentry
naquele estado teria capturado quase nada e dado uma falsa sensação de cobertura. Isso foi
corrigido — todos os catch agora logam com o `requestId` — então o caminho está aberto.

Por que ainda assim adiar:
- O DSN exige conta. Um SDK instalado e nunca exercitado é um SDK que você descobre mal
  configurado no dia do lançamento.
- No frontend o `@sentry/nextjs` é invasivo: envolve o `next.config`, adiciona arquivos de
  instrumentação e sobe sourcemap no build (precisa de auth token). Não é uma dependência para
  entrar sem alguém validando o build.
- Sem tráfego real, não há o que observar. O valor aparece junto com os primeiros usuários.

Quando ligar (ordem sugerida):
1. Backend primeiro: `@sentry/node` com `Sentry.setupFastifyErrorHandler`. É inerte sem DSN,
   não afeta o build, e agora recebe os erros dos controllers.
2. Frontend depois, junto com um `app/error.tsx` e um `app/global-error.tsx` — hoje não existe
   nenhum error boundary, então uma exceção de render mostra a tela branca do Next.
3. Só então considerar performance/tracing, que é o que encarece o plano.

Alternativa se o custo pesar: os logs estruturados que já existem (pino em JSON, com
`requestId` em cada linha) alimentam qualquer coletor — Better Stack, Axiom, ou o log nativo do
Railway com retenção paga. Resolve alerta e busca; não resolve agrupamento por stack nem erro
de navegador.

---

### Upload de arquivos
**Risco:** ausência de validação de conteúdo real (só MIME type declarado pelo client), sem
limite de armazenamento por usuário, sem limpeza de arquivos órfãos.

Itens:
- Validar magic bytes além do `Content-Type` (ex: `file-type` npm)
- Limite de tamanho por arquivo (atual: controlado pelo Fastify `bodyLimit`) e por usuário/projeto
- Scan antivírus (ClamAV via clamdscan ou serviço externo)
- Cron job para deletar `Arte` sem `projetoId` ativo ou arquivos no storage sem registro no DB
- ZIP bomb: se aceitar ZIP/RAR, descomprimir com limite de tamanho de saída

Localização: `src/controllers/arteController.ts`, `src/services/storageService.ts`.

---

### Rate limiting granular
**Risco:** endpoints sensíveis sem proteção específica permitem força bruta ou flood.

Endpoints que precisam de limites dedicados (além do global):
- `POST /auth/login` — 5 req/min por IP (atual: ausente)
- `POST /auth/forgot-password` — 3 req/hora por IP
- `GET /links/:slug` — 30 req/min (público, sem auth)
- `POST /artes` (upload) — 10 req/min por usuário
- `POST /feedbacks` — 20 req/min por usuário

Referência: `GET /usuarios/buscar` tem 60 req/min — usar como modelo.

---

### Auditoria
**Risco:** ações críticas (aprovação, pagamento, saque, alteração de papel, exclusão de projeto)
não geram log imutável. Em caso de disputa contratual ou compliance, não há evidência.

Proposta de tabela:
```
AuditLog { id, usuarioId, acao, entidade, entidadeId, payload Json, ip, userAgent, criadoEm }
```

Ações prioritárias para logar: `APROVACAO_CRIADA`, `PAGAMENTO_PROCESSADO`, `SAQUE_SOLICITADO`,
`PAPEL_ALTERADO`, `PROJETO_EXCLUIDO`, `ACEITE_CONTRATO`.

Nota: `AceiteTermos` já existe — usar como referência de estrutura.

---

### Convites para equipe
**Risco:** `POST /equipes/:id/membros` adiciona usuário por ID direto, sem consentimento.
Qualquer líder de equipe pode forçar qualquer usuário a fazer parte da equipe.

Solução esperada: fluxo de convite por e-mail/token similar ao convite designer↔cliente.
Tabela `EquipeConvite` com token, expiração e papel proposto.

Localização: `src/services/equipeService.ts:adicionarMembro`.

---

### Exclusão de dados (LGPD)
**Risco:** `DELETE /usuarios/:id` não está implementado (ou não tem efeito em cascata definido).
Obrigatório pela Lei 14.510/2022 (Marco Legal da IA) e LGPD (Art. 18, IV).

Verificar:
- O que acontece com projetos do usuário excluído? (designer/cliente)
- Artes, feedbacks, aprovações, pagamentos ficam órfãos?
- Links públicos criados por ele continuam ativos?
- Saques pendentes?

Solução mínima: `usuário.ativo = false` + anonimização de PII (nome, email, telefone) via job
assíncrono, mantendo os registros financeiros por obrigação legal (5 anos).

---

### Soft delete
**Registros que nunca devem ser fisicamente deletados:**
- `Pagamento`, `Fatura`, `Saque` — obrigação fiscal
- `Aprovacao`, `AceiteTermos` — evidência contratual (Lei 14.063/20)
- `AuditLog` (quando implementado)

Prisma não tem soft delete nativo; usar `deletedAt DateTime?` + extension de middleware global
ou biblioteca `prisma-soft-delete-middleware`.

---

## 🟡 Médio

### Busca avançada
Hoje: filtro básico por `status`, `designerId`, `clienteId` e `search` (nome).
Falta: busca por equipe, por tags (quando existirem), por intervalo de datas, full-text search
em descrição/briefing.

Para full-text: habilitar `@@index([descricao], type: Brin)` no Prisma ou usar Postgres
`tsvector` com GIN index.

---

### Notificações
Ações que deveriam gerar notificação (ainda não implementadas):
- Novo feedback em arte
- Arte enviada para revisão
- Aprovação/rejeição de arte
- Fatura gerada
- Pagamento confirmado
- Convite para equipe

Canal mínimo: e-mail via `nodemailer` + tabela `Notificacao` para centro de notificações in-app.
Push e WebSocket são fase posterior.

---

### Versionamento de arte
Hoje: `Arte` tem um único `arquivoUrl`. Novas versões sobrescrevem ou criam nova `Arte`.
Proposta: tabela `ArteVersao` com histórico de uploads, possibilidade de restauração e diff
visual lado a lado.

---

### Comentários em threads
Hoje: `Feedback` é plano (sem resposta a outro feedback).
Proposta: campo `parentId` em `Feedback` para threads, `@menções` resolvidas via `usuarioId`,
flag `resolvidoEm` para fechar thread e `tipo: INTERNO | EXTERNO` para comentários visíveis
apenas para a equipe.

---

### Permissões finas
Hoje: três papéis globais (ADMIN, DESIGNER, CLIENTE). Papéis de equipe (LIDER, DESIGNER, etc.)
são organizacionais — `TODO(fase-b)` em `authorizationMiddleware.ts`.

Próxima fase: RBAC por ação — `aprovar_arte`, `editar_financeiro`, `convidar_membro` — com
tabela `Permissao` e herança por papel.

---

### Assinaturas (SaaS billing)
Não implementado. Estrutura mínima necessária:
- `Plano { id, nome, preco, limitesProjetos, limitesArtes, limitesMembros }`
- `Assinatura { usuarioId, planoId, status, periodoFim, stripeSubscriptionId? }`
- Webhook Stripe/MP para eventos de pagamento/cancelamento
- Middleware que bloqueia criação além do limite do plano

---

### Observabilidade
Hoje: `console.log` disperso, sem correlação entre requisições.

Itens:
- Logger estruturado (pino já é dependência indireta do Fastify — habilitar serializers)
- Request ID propagado em todos os logs da requisição
- Métricas: latência por rota, taxa de erro, fila de jobs
- Error tracking: Sentry ou similar (uma linha de setup no Fastify)
- Tracing: OpenTelemetry para rastrear chamadas ao Prisma e ao Mercado Pago

---

## 🟢 Futuro

### Workspace (multi-tenant)
Preparação para migrar de "usuário dono de projetos" para "workspace dono de projetos".
Necessário antes de lançar planos empresariais. Não implementar antes de validar demanda.

`TODO(fase-b)` em `src/middleware/authorizationMiddleware.ts` e `src/services/equipeService.ts`.

---

### Integrações externas
- Figma: importar frames como artes
- Google Drive: exportar aprovações e briefings
- Slack/Discord: notificações de aprovação
- Zapier/Make: webhooks de saída para automações do cliente

---

### IA e automação
- EvalForge já integrado para avaliação de briefing (`src/services/evalForgeService.ts`)
- OCR em artes (extrair texto de imagens para busca)
- Resumo automático de threads de feedback
- Sugestão de revisão baseada em histórico de feedbacks recorrentes

Não priorizar antes do core estar estável e com boa cobertura de testes.

---

*Última atualização: 2026-08-19*
