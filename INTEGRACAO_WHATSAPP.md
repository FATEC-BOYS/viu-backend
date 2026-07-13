# Integração WhatsApp Business (Meta Cloud API)

Estrutura de recepção e envio para o fluxo de aprovação via WhatsApp — o coração da
Estratégia v1.0 (ver `DIRECIONAMENTO.md`). Este documento descreve o que existe, como
configurar e o que ficou de fora de propósito.

## O fluxo

```
Agência (autenticada)                    Cliente final (WhatsApp, sem login)
─────────────────────                    ───────────────────────────────────
POST /whatsapp/envios ──► card com botões ──► ✅ Aprovar │ ✏️ Pedir alteração
                                              │
        webhook ◄─── botão / texto / áudio ◄──┘
        │
        ├─ botão aprovar/confirmar → Aprovacao + Arte APROVADO + notificação
        ├─ botão alterar → pede detalhes → Feedback + Arte REVISAO
        ├─ texto/áudio "tá bom" → card de CONFIRMAÇÃO (Princípio nº 3)
        └─ texto/áudio pedido de mudança → Feedback + Arte REVISAO
```

Princípios aplicados (de `DIRECIONAMENTO.md`):

- **Nº 1** — o cliente final nunca faz login: tudo acontece por botões e mensagens.
- **Resposta livre nunca é erro** — texto e áudio (transcrito via Whisper, já existente
  em `transcricaoService`) são entradas normais.
- **Nº 3** — aprovação inferida de resposta livre ("tá bom") NÃO vira registro: o
  sistema envia um card "Entendi que você aprovou X — confirma?" e só o toque em
  Confirmar cria a `Aprovacao`. Inferência para conveniência, confirmação para registro.

## Mapa do código

| Arquivo | Responsabilidade |
|---|---|
| `src/types/whatsapp.ts` | Tipos do payload da Meta + mensagem normalizada + ids de botão |
| `src/services/whatsappService.ts` | Cliente Graph API (envio de cards/templates, download de mídia, validação de assinatura) |
| `src/services/whatsappWebhookService.ts` | Recepção: dedup por wamid (WebhookLog), normalização, despacho, efeitos de domínio |
| `src/services/whatsappEnvioService.ts` | Disparo pela agência: autorização, telefone, anti-duplicidade, persistência do wamid |
| `src/controllers/whatsappController.ts` | Handlers HTTP (verificação GET, webhook POST, envios autenticados) |
| `src/routes/whatsapp.ts` | Rotas + parser de corpo bruto (necessário para X-Hub-Signature-256) |
| `prisma` → `whatsapp_envios` | Correlação arte ↔ cliente ↔ telefone ↔ wamid + máquina de estados |

### Máquina de estados do `WhatsAppEnvio`

```
AGUARDANDO_RESPOSTA ──(botão aprovar)──────────────► APROVADA
        │ ──(texto/áudio ≈ aprovação)──► AGUARDANDO_CONFIRMACAO ──(confirmar)──► APROVADA
        │ ──(botão alterar)────────────► AGUARDANDO_DETALHES ──(texto/áudio)──► ALTERACAO_REGISTRADA
        │ ──(texto/áudio ≈ alteração)──────────────► ALTERACAO_REGISTRADA
        └ ──(status "failed" da Meta)──────────────► FALHOU
```

## Endpoints

- `GET /webhooks/whatsapp` — verificação do endpoint pela Meta (hub.challenge).
- `POST /webhooks/whatsapp` — mensagens e statuses. Valida `X-Hub-Signature-256` sobre
  o corpo bruto, responde 200 imediatamente, processa async com dedup por wamid.
- `POST /whatsapp/envios` (auth) — `{ arteId, linkPreview? }` dispara o card de
  aprovação para o cliente do projeto. 409 se já houver solicitação ativa.
- `GET /whatsapp/envios?arteId=` (auth) — histórico de solicitações da arte.

## Configuração

1. Criar app na Meta (developers.facebook.com → tipo Business → produto WhatsApp).
2. Preencher no `.env` (ver `.env.example`): `WHATSAPP_ACCESS_TOKEN` (token permanente
   de system user), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN` (valor arbitrário nosso).
3. Cadastrar o webhook: URL `https://<api>/webhooks/whatsapp`, verify token igual ao do
   `.env`, assinar o campo `messages`.
4. Rodar a migration: `npm run db:migrate:deploy` (cria `whatsapp_envios`).

Sem as variáveis, o servidor sobe normalmente: o webhook recusa (403/401) e o disparo
retorna 503 — a integração é opcional por configuração.

## Decisões técnicas

- **Corpo bruto no webhook:** a assinatura da Meta é HMAC do byte stream; o parser
  padrão de JSON destruiria a verificação. O parser buffer é encapsulado no plugin de
  rotas do WhatsApp e não afeta o resto da API.
- **200 antes de processar:** a Meta reenvia em timeout; responder rápido e deduplicar
  por wamid (`WebhookLog.externalId` unique) evita processamento duplo — mesmo padrão
  do webhook do MercadoPago.
- **Telefone validado contra o envio:** um botão tocado só tem efeito se vier do
  telefone para o qual aquele card foi enviado.
- **Heurística de interpretação** (`interpretarResposta`) é intencionalmente simples e
  substituível por LLM; o contrato não muda porque, pelo Princípio nº 3, o resultado é
  sempre sugestão — nunca registro direto.

## Fora de escopo (de propósito)

- **Templates aprovados pela Meta** — necessários para INICIAR conversa fora da janela
  de 24h. `enviarTemplate` existe, mas a criação/aprovação dos templates é manual no
  painel e depende de conta Business verificada. Até lá, testes funcionam respondendo
  à mensagem do cliente (janela de atendimento) ou com números de teste do app.
- **Lembretes automáticos** — dependem de scheduler; a estrutura anti-duplicidade já
  prevê reuso do envio ativo.
- **Escolha de BSP / conta oficial** — decisão de negócio pendente (ver riscos no
  DIRECIONAMENTO: custo por conversa, verificação de empresa, risco de bloqueio).
- **Classificação via LLM** da resposta livre — plugue em `interpretarResposta`.
