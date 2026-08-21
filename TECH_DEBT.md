# Tech Debt

Decisões arquiteturais pendentes, riscos conhecidos e trabalho intencionalmente adiado.
Atualizar este arquivo ao abrir ou fechar um item. Cada entrada deve ter contexto suficiente
para que alguém novo entenda o problema sem ler o histórico de PRs.

> Dívidas de frontend em `/home/user/viu-frontend/TECH_DEBT.md`.

---

## 🔴 Crítico

### Revisão de autorização (IDOR) — cobertura parcial
**Risco:** troca de IDs em rotas que recebem `:id` pode expor recursos de outro tenant.

Já coberto por teste (`tests/middleware/idor.test.ts`): `requireProjectAccess` resolvendo
`projetoId` a partir de feedback, e os aceites contratuais (`listarAceitesProjeto`,
`registrarAceite`), incluindo o bypass de ADMIN.

Falta auditar, com dois tenants de teste e tentativa cruzada:
- `GET/PUT/DELETE /artes/:id`
- `POST /aprovacoes` — verifica se `arteId` pertence ao projeto do caller?
- `GET /faturas/:id`, `POST /faturas/:id/pagar/pix`
- `GET /saques/:id`, `GET /ledger/:designerId`
- `GET /preview/:token` — público, mas o que o payload devolve pode vazar info do projeto
- `GET /equipes/:id` — protegido por `isMembro`, revisar casos de borda

Usar `requireProjectAccess` como referência de padrão correto.

---

## 🟠 Alto

### Upload de arquivos — falta o que vem depois da validação
**Feito:** magic bytes conferidos além do `Content-Type` declarado
(`src/middleware/fileUploadMiddleware.ts`), limite de corpo via `bodyLimit` do Fastify.

**Falta:**
- Limite de armazenamento por usuário/projeto (hoje só existe o limite por arquivo)
- Scan antivírus (ClamAV via clamdscan ou serviço externo)
- Job de limpeza: `Arte` sem projeto ativo, e arquivos no storage sem registro no banco
- ZIP bomb: se aceitar ZIP/RAR, descomprimir com limite de tamanho de saída

Localização: `src/controllers/arteController.ts`, `src/utils/storage.ts`.

---

### Autenticação social (Google) não existe no backend
**Risco:** funcionalidade prometida pela interface e ausente no servidor.

O frontend tem `components/auth/SocialAuthButtons.tsx` pronto e um `TODO` nas telas de login
e cadastro esperando `GET /auth/google` + `/auth/google/callback`. Não há nenhuma rota OAuth
aqui — nem provider, nem callback, nem vínculo de conta social a `Usuario`.

Decidir entre implementar (Google OAuth 2.0, vincular por e-mail verificado, tratar conflito
com conta que já existe por senha) ou remover o componente do frontend. Manter o botão pronto
e o backend ausente é o pior dos dois mundos.

---

### Convite enviado não pode ser cancelado
`criarConvite` cancela o convite pendente anterior do mesmo par projeto/usuário, mas não há
`DELETE`/`PUT .../cancelar` para revogar um convite em aberto. Quem convidou por engano só
consegue esperar os 7 dias de expiração.

O painel de pessoas do projeto (frontend) já lista os convites e o botão de cancelar depende
só disso.

Localização: `src/services/conviteService.ts`, `src/routes/convites.ts`.

---

### Soft delete parcial
Hoje só `Aprovacao` tem `deletedAt` (evidência contratual — ver `tests/services/aprovacaoSoftDelete.test.ts`).

`Pagamento`, `Fatura`, `Saque` e `AceiteContratual` não têm. O risco está mitigado por
acidente e não por desenho: `DELETE /faturas/:id` chama `cancelarFatura` (muda status, não
apaga) e não existe rota de exclusão para pagamento nem para saque. Se alguém adicionar uma,
o registro fiscal some de vez.

Prisma não tem soft delete nativo; usar `deletedAt DateTime?` + extension global ou
`prisma-soft-delete-middleware`.

---

### Monitoramento de segurança com lógica pendente
`src/services/securityMonitoringService.ts` tem três `TODO` que deixam o serviço menos capaz
do que a interface sugere:
- geolocalização real (hoje o evento registra o IP sem resolver origem)
- rate limiting inteligente (o limite por rota existe; o adaptativo, não)
- sistema de alertas (e-mail, Slack, PagerDuty) para eventos críticos

Há também um `TODO` em `src/controllers/securityController.ts:237`: falta `getUserEvents` no
serviço para a rota de eventos por usuário.

---

## 🟡 Médio

### Busca cobre só projetos e artes
`GET /buscar` faz full-text em português (`to_tsvector` + `ts_rank`) sobre nome e descrição de
`projetos` e `artes`, e filtra pelos projetos do usuário. A paleta Ctrl/Cmd+K do frontend
consome exatamente isso.

Falta: equipes, clientes e feedbacks; filtro por tags (quando existirem); e um índice GIN
materializado — hoje o `to_tsvector` é calculado a cada consulta.

---

### Entidade de contato não existe
O `ClienteWizard` do frontend espera `POST /contatos` para registrar alguém que ainda não é
usuário da plataforma. Não há modelo `Contato` no schema — só `Usuario`.

Hoje o typeahead resolve por `GET /usuarios/buscar`, que só encontra quem já tem conta.
Decidir: criar a entidade (contato vira usuário quando aceita um convite) ou assumir que todo
participante precisa de conta e ajustar o wizard.

---

### `status` é ignorado silenciosamente ao criar projeto
`CreateProjetoRequestSchema` não declara `status` — por desenho, todo projeto começa em
`EM_ANDAMENTO` (ou `RASCUNHO`, quando há convite). Como o Zod remove chaves desconhecidas em
vez de recusar, o `status` que o formulário envia some sem erro nenhum.

Ou aceitar e validar a transição, ou recusar explicitamente com 400. Ignorar em silêncio é o
comportamento que engana quem integra.

---

### Permissões finas por equipe
Os papéis de equipe (`LIDER`, `DESIGNER`, `REVISOR`, `CLIENTE`) são organizacionais.
`equipeId` em projeto é agrupamento visual e **não** concede acesso — está documentado em
`src/controllers/projetoController.ts:114` e no `TODO(fase-b)` de
`src/middleware/authorizationMiddleware.ts:175`.

`src/utils/permissions.ts` já dá permissões por ação (`requirePermission`). A fase seguinte é
fazer o papel de equipe conceder acesso a projeto — o que depende da decisão de workspace
abaixo.

---

## 🟢 Futuro

### Workspace (multi-tenant)
Preparação para migrar de "usuário dono de projetos" para "workspace dono de projetos".
Necessário antes de lançar planos empresariais. Não implementar antes de validar demanda.

`TODO(architecture)` em `prisma/schema.prisma:10` e `TODO(fase-b)` em
`src/middleware/authorizationMiddleware.ts`.

---

### Integrações externas
- Figma: importar frames como artes
- Google Drive: exportar aprovações e briefings
- Slack/Discord: notificações de aprovação
- Zapier/Make: webhooks de saída para automações do cliente

---

### IA e automação
- EvalForge já integrado para avaliação de briefing (`src/services/evalForgeService.ts`)
- Transcrição de áudio já integrada (`src/services/transcricaoService.ts`)
- OCR em artes (extrair texto de imagens para busca)
- Resumo automático de threads de feedback
- Sugestão de revisão baseada em histórico de feedbacks recorrentes

---

## ✅ Resolvido

Mantido aqui porque estas entradas ficaram abertas por muito tempo depois de prontas — e
alguém voltou a implementar o que já existia.

- **Convite designer ↔ cliente**: `ConviteProjeto` com token hasheado, expiração de 7 dias,
  e-mail via Resend e aceite que move o projeto de `RASCUNHO` para `EM_ANDAMENTO`. Responder
  também funciona pelo id do convite, para quem perdeu o e-mail.
- **Convites de equipe**: `EquipeConvite`, mesmo desenho, com papel proposto.
- **Máquina de estados**: `src/utils/stateMachine.ts` com as transições válidas de projeto,
  arte e fatura, validadas no service antes de qualquer `update`.
- **Webhooks do Mercado Pago**: assinatura HMAC-SHA256 conferida
  (`src/services/mercadoPagoService.ts`) e `WebhookLog` garantindo idempotência.
- **Ledger financeiro**: `LedgerEntry` como fonte da verdade do saldo, com estorno
  referenciado e idempotência no pagamento por Pix.
- **Auditoria**: `AuditLog` + `src/middleware/auditLogMiddleware.ts`.
- **Rate limiting granular**: limites dedicados por rota — login e reset (5/15min), links
  públicos, uploads, feedbacks, transcrição de áudio.
- **Exclusão de dados (LGPD)**: `DELETE /usuarios/:id` desativa e anonimiza PII, mantendo o
  registro financeiro, e grava a anonimização no log de auditoria.
- **Threads de feedback**: `parentId`, `resolvidoEm` e rotas de resolver/reabrir.
- **Versionamento de arte**: `ArteVersao` com upload, listagem e restauração.
- **Assinaturas**: `Plano`, `Assinatura`, webhook e middleware de limite de plano.
- **Observabilidade**: pino estruturado com `requestId` propagado, e todos os `catch` de
  controller registrando o erro em vez de descartá-lo.
- **Error tracking**: `@sentry/node` opt-in por `SENTRY_DSN` (`src/observability/sentry.ts`).
  Sem DSN nada é enviado. Falta o lado do frontend.

---

*Última atualização: 2026-08-21*
