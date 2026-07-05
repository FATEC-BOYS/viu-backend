# VIU — Production Launch

Documento operacional de lançamento. Qualquer pessoa com acesso ao repositório
e às credenciais deve conseguir seguir este guia de ponta a ponta, inclusive às 2h da manhã.

**Regra principal:** se qualquer item do Go/No-Go for "não", o lançamento espera.

---

## 1. Banco de Dados

- [ ] PostgreSQL criado no provedor escolhido (Supabase, Railway, Neon, ou self-hosted)
- [ ] `DATABASE_URL` anotado e disponível
- [ ] Migrações executadas:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] Seed inicial executado (planos, admin):
  ```bash
  npx tsx src/database/seed.ts
  ```
- [ ] Backup automático habilitado no provedor (diário, retenção mínima 7 dias)
- [ ] Restore testado: restaurar backup em ambiente paralelo e verificar tabelas

---

## 2. Variáveis de Ambiente

Copiar `.env.example` para `.env.production` e preencher **todos** os campos:

```env
NODE_ENV=production
DATABASE_URL=
JWT_SECRET=                   # mínimo 32 chars, gerado com: openssl rand -hex 32
ALLOWED_ORIGINS=https://viu.app
FRONTEND_URL=https://viu.app

# Cloudflare R2
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=viu

# Mercado Pago
MP_ACCESS_TOKEN=              # APP_USR-... (produção, não sandbox)
MP_WEBHOOK_SECRET=            # gerado no painel do MP

# Resend
RESEND_API_KEY=               # re_...
EMAIL_FROM=VIU <noreply@viu.app>

# EvalForge
EVALFORGE_URL=
EVALFORGE_INTERNAL_KEY=
```

- [ ] Nenhum campo obrigatório em branco
- [ ] `JWT_SECRET` gerado com entropia real (não inventado)
- [ ] Variáveis injetadas no ambiente de deploy (não commitadas)

---

## 3. Storage — Cloudflare R2

- [ ] Bucket criado com nome `viu` (ou o definido em `R2_BUCKET`)
- [ ] CORS configurado no bucket:
  ```json
  [
    {
      "AllowedOrigins": ["https://viu.app"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
- [ ] API Token com permissão de leitura e escrita no bucket
- [ ] Teste de upload via API:
  ```bash
  curl -X POST https://api.viu.app/artes/upload \
    -H "Authorization: Bearer <token>" \
    -F "file=@test.png" -F "nome=Teste" -F "projetoId=<id>"
  ```
- [ ] Arquivo aparece no bucket R2
- [ ] URL do arquivo é acessível via GET

---

## 4. E-mails — Resend

- [ ] Domínio adicionado no painel do Resend
- [ ] SPF configurado no DNS:
  ```
  v=spf1 include:amazonses.com ~all   # (ou o SPF que o Resend indicar)
  ```
- [ ] DKIM: registro CNAME adicionado no DNS
- [ ] DMARC configurado:
  ```
  v=DMARC1; p=quarantine; rua=mailto:dmarc@viu.app
  ```
- [ ] DNS propagado (verificado no painel do Resend — status "Verified")
- [ ] Teste de recuperação de senha: receber e-mail em inbox real, não spam
- [ ] Teste de convite de projeto: link no e-mail abre a página correta
- [ ] Teste de convite de equipe: idem

---

## 5. Mercado Pago

- [ ] Conta MP verificada com CPF/CNPJ (necessário para conta de produção)
- [ ] `MP_ACCESS_TOKEN` de **produção** (começa com `APP_USR-`, não `TEST-`)
- [ ] Webhook configurado no painel do MP:
  - URL: `https://api.viu.app/pagamentos/webhook`
  - Eventos: `payment`
- [ ] `MP_WEBHOOK_SECRET` gerado e salvo no `.env.production`
- [ ] Teste PIX ponta a ponta:
  - Criar projeto → gerar fatura → pagar com PIX sandbox
  - Verificar que `Fatura.status` muda para `PAGA`
  - Verificar que `LedgerEntry` de CREDITO foi criado
- [ ] Teste de saldo: `GET /saques/saldo` retorna valor correto
- [ ] Teste de saque: solicitar saque, admin processa, `LedgerEntry` de DEBITO criado
- [ ] Webhook duplicado: reenviar o mesmo `x-request-id` → segundo processamento ignorado (verificar `WebhookLog`)

---

## 6. IA — EvalForge

- [ ] EvalForge deployado e acessível em `EVALFORGE_URL`
- [ ] `EVALFORGE_INTERNAL_KEY` configurado em ambos os lados
- [ ] Teste briefing válido (>= 30 chars, bem descrito) → projeto criado normalmente
- [ ] Teste briefing fraco (< qualidade mínima) → 422 com sugestões de melhoria
- [ ] Teste `skipBriefingEval: true` → projeto criado sem avaliação (fallback funciona)
- [ ] EvalForge derrubado intencionalmente → `skipBriefingEval: true` contorna sem erro

---

## 7. Segurança

- [ ] HTTPS habilitado (certificado SSL válido, sem aviso no browser)
- [ ] Redirect HTTP → HTTPS ativo
- [ ] Rate limit testado em `/auth/login` (5 req/min por IP)
- [ ] Rate limit testado em `POST /saques` (5 req/hora por usuário)
- [ ] Header `x-request-id` ecoado nas respostas (rastreabilidade)
- [ ] `JWT_SECRET` com pelo menos 32 chars aleatórios
- [ ] Nenhuma variável sensível exposta em logs (`console.log` não imprime tokens)

---

## 8. Observabilidade

- [ ] Sentry configurado:
  ```bash
  # Instalar e adicionar DSN nas env vars
  SENTRY_DSN=https://...@sentry.io/...
  ```
- [ ] Sentry recebe erros de teste (lançar erro proposital, verificar no dashboard)
- [ ] Logs estruturados visíveis no provedor de cloud (Railway, Render, Fly.io)
- [ ] Uptime monitor criado (UptimeRobot ou Better Stack) apontando para `GET /`
- [ ] Alerta de downtime configurado para e-mail/Slack/WhatsApp

---

## 9. Jurídico

- [ ] Política de Privacidade publicada em `/privacidade`
- [ ] Termos de Uso publicados em `/termos`
- [ ] Aviso de LGPD visível no cadastro
- [ ] Checkbox de aceite dos Termos marcado como obrigatório no onboarding
- [ ] `AceiteTermos` sendo gravado no banco ao cadastrar (verificar via DB)

---

## 10. Produto

- [ ] Landing page publicada com proposta de valor clara
- [ ] Página de preços publicada
- [ ] Viewer público (`/viewer/:token`) testado por alguém que nunca viu o produto
- [ ] Fluxo de convite de projeto testado ponta a ponta com e-mail real
- [ ] Mensagens de erro genéricas revisadas (nenhum stack trace visível ao usuário)
- [ ] Onboarding: novo usuário consegue criar primeiro projeto sem ajuda

---

## 11. Smoke Test Final

Executar manualmente antes de liberar acesso público:

| Etapa | Resultado esperado | OK? |
|---|---|---|
| Cadastro com e-mail novo | Conta criada, e-mail de verificação recebido | ☐ |
| Login com credenciais corretas | Token JWT retornado | ☐ |
| Login com senha errada | 401, não 500 | ☐ |
| Criar projeto com briefing fraco | 422 com sugestões do EvalForge | ☐ |
| Criar projeto com briefing válido | 201, convite enviado ao cliente | ☐ |
| Cliente aceita convite | Projeto sai de `RASCUNHO` | ☐ |
| Upload de arte | Arquivo no R2, `Arte` criada no banco | ☐ |
| Compartilhar link público | Viewer abre sem login, exibe arte | ☐ |
| Cliente deixa feedback | `Feedback` criado, designer notificado | ☐ |
| Cliente aprova arte | `Arte.status = APROVADO`, state machine bloqueia nova aprovação | ☐ |
| Designer gera fatura | `Fatura` criada, cliente notificado por e-mail | ☐ |
| Cliente paga via PIX | QR code gerado, webhook recebido, `Fatura.status = PAGA` | ☐ |
| Saldo do designer | `GET /saques/saldo` reflete pagamento | ☐ |
| Solicitar saque | `Saque` criado com status `SOLICITADO` | ☐ |
| Admin processa saque | `Saque.status = CONCLUIDO`, `LedgerEntry` de DEBITO criado | ☐ |
| Restore de backup | Banco restaurado em ambiente paralelo, dados íntegros | ☐ |

---

## Go / No-Go

Responder imediatamente antes do lançamento. **Uma resposta "não" = lançamento espera.**

| Pergunta | Sim | Não |
|---|---|---|
| Consigo criar conta? | ☐ | ☐ |
| Consigo criar projeto? | ☐ | ☐ |
| Consigo subir arte? | ☐ | ☐ |
| O cliente consegue visualizar sem login? | ☐ | ☐ |
| O cliente consegue aprovar sem ajuda? | ☐ | ☐ |
| O pagamento PIX funciona? | ☐ | ☐ |
| O saque funciona? | ☐ | ☐ |
| Os e-mails chegam (não vão para spam)? | ☐ | ☐ |
| Consigo restaurar um backup? | ☐ | ☐ |
| O EvalForge (ou fallback) está funcionando? | ☐ | ☐ |

---

## Rollback

Se algo crítico falhar após o lançamento:

```bash
# 1. Colocar banner de manutenção no frontend
# 2. Reverter migration (se aplicável):
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Fazer rollback do deploy no provedor
# 4. Restaurar backup do banco se necessário
# 5. Investigar logs no Sentry + provedor antes de re-deploy
```

---

*Última atualização: 2026-07-05*
