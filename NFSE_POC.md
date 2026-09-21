# POC de NFS-e no VIU

Checklist para provar que *pagamento de assinatura → nota autorizada* funciona
no CNPJ do VIU, **sem ainda plugar no código de produção**.

**Prazo sugerido:** 3–5 dias úteis por provedor (máx. 2 na shortlist).

> O conteúdo das seções 0 a 8 é o plano como foi definido. A seção 9 reúne o
> que o código do VIU tem (ou não tem) hoje para sustentar esse plano —
> conferido no repositório, não suposto.

---

## 0. Antes de qualquer API (com o contador)

- [ ] CNPJ ativo e regime definido (MEI / Simples / etc.)
- [ ] Município de prestação do serviço do VIU
- [ ] Código do serviço / LC 116 (ou equivalente que o contador indicar) para **software / plataforma / SaaS**
- [ ] Alíquotas / retenções que se aplicam ao **nosso** caso
- [ ] Certificado **A1** (arquivo + senha) ou caminho que o emissor usar
- [ ] 1 nota **manual** já autorizada no painel (prova de que o fiscal está ok *sem* API)

Se o item manual falhar, **não** comece integração.

---

## 1. Conta no provedor

- [ ] Conta homologação / sandbox
- [ ] Conta ou ambiente de produção (só depois do sandbox)
- [ ] CNPJ cadastrado + certificado enviado
- [ ] Webhook URL de teste (RequestBin, webhook.site ou ngrok)
- [ ] API key / token com escopo mínimo

**Provedores na POC (escolher 2):** Focus NFe · NFe.io · (opcional) eNotas / Nuvem Fiscal / Notaas

---

## 2. Casos de teste obrigatórios

| # | Caso | Critério de ok |
|---|------|----------------|
| 1 | Emitir NFS-e **simples** (tomador PF com CPF) | Status autorizado + número / PDF ou XML |
| 2 | Emitir com tomador **CNPJ** | Idem |
| 3 | **Mesmo** `idempotency key` / `ref` duas vezes | **Uma** nota só (sem duplicar) |
| 4 | Dados inválidos (CPF lixo) | Erro **claro** (código + mensagem acionável) |
| 5 | Consultar nota por id/ref | Retorna status atual |
| 6 | Webhook `autorizada` | Chega sem polling eterno |
| 7 | Webhook ou status `rejeitada` (forçar erro fiscal se possível) | Dá para mostrar ao user/ops |
| 8 | Cancelamento (se o município/provedor permitir) | Fluxo documentado; senão anotar limitação |

Payload mínimo a exercitar:

- prestador (VIU)
- tomador (nome, CPF/CNPJ, e-mail, endereço se exigido)
- serviço (código + discriminação: "Assinatura VIU – plano X – competência mm/aaaa")
- valor, data de competência
- referência interna = `assinaturaId` ou `pagamentoId` do VIU — **ver seção 9.2**

---

## 3. Critérios de "passou na POC"

- [ ] Tempo até **1ª nota autorizada** em homologação: < 1 dia de trabalho líquido
- [ ] Documentação suficiente para o time sem abrir chamado a cada erro
- [ ] Idempotência confiável no retry
- [ ] Webhook verificável (assinatura/secret se houver)
- [ ] PDF e/ou XML baixáveis e **armazenáveis** por nós (5 anos é obrigação típica — alinhar com contador)
- [ ] Preço no **nosso** volume (ex.: 20, 100, 500 notas/mês) calculado com franquia + excedente + setup
- [ ] Suporte: resposta útil em < 1 dia útil **na POC** (sinal fraco = risco depois)

**Eliminatória:** não emite no nosso município / rejeição opaca / duplica nota no retry.

---

## 4. O que guardar no banco do VIU (depois, na integração real)

| Campo | Uso |
|--------|-----|
| `pagamentoId` / `assinaturaId` | gatilho e idempotência |
| `provedor` + `notaId` externo | suporte e reconsulta |
| `status` (`pendente`, `autorizada`, `rejeitada`, `cancelada`) | UI / ops |
| `numero` / `codigoVerificacao` | cliente |
| `pdfUrl` ou storage próprio | download |
| `xml` ou ref de arquivo | obrigação legal |
| `tentativas` / `ultimoErro` | debug |
| `emitidaEm` | auditoria |

Regra: **1 pagamento de assinatura elegível → no máximo 1 nota autorizada**
(a ref interna garante).

---

## 5. Gatilho de produto (escopo da 1ª integração)

**Dentro**

- [ ] Assinatura VIU paga (Mercado Pago / status que já consideramos `PAGA`)
- [ ] Emissão assíncrona (fila ou "fire + webhook")
- [ ] Tela ops ou admin: status da nota + reprocessar se rejeitada

**Fora da v1**

- NF do projeto designer → cliente final
- Multi-CNPJ de usuários
- Carta de correção / fluxos raros
- NFC-e / produto físico

---

## 6. Plano de falha

- [ ] Pagamento ok e nota rejeitada → assinatura **continua válida**; fila de correção humana
- [ ] Provedor fora do ar → retry com backoff + alerta
- [ ] Nunca bloquear login do designer porque a NF falhou

---

## 7. Scorecard (preencher na POC)

| Critério (1–5) | Provedor A | Provedor B |
|----------------|------------|------------|
| 1ª nota no município | | |
| Clareza de erro | | |
| Idempotência | | |
| Webhook | | |
| Docs / DX | | |
| Preço no volume real | | |
| Confiança no suporte | | |
| **Total** | | |

Vence quem **autoriza de verdade** e a gente entende quando falha — não quem
tem site mais bonito.

---

## 8. Decisão final (1 frase)

> "Vamos com ____ porque emitiu no município ____, não duplicou com a ref ____,
> webhook ok, e cabe em R$ ____/mês no volume ____."

---

**Dica:** rodar a POC **fora** do monorepo do VIU (script Node/Python + ngrok).
Só depois um adapter `NotaFiscalProvider` no backend. Assim a escolha do
fornecedor não gruda no deploy do produto.

---

## 9. O que o código do VIU tem hoje

Conferido no repositório em 21/09/2026. Esta seção existe porque a POC pode
passar com louvor e a integração não ter onde se pendurar.

### 9.1. O tomador já existe

`DadosFiscais` (tabela `dados_fiscais`, uma por conta) guarda tipo de pessoa,
CPF/CNPJ, razão social, nome fantasia, inscrição municipal e endereço
completo — que é o payload de tomador da seção 2. O documento é validado na
entrada (dígitos verificadores, e o par tipo/documento precisa combinar) e
gravado só com dígitos.

Preenchido pela pessoa em `/perfil`. Escopo estrito: nenhuma rota aceita id de
terceiro.

### 9.2. O pagamento da assinatura NÃO existe como registro

`Pagamento` tem a coluna `assinaturaId` e a relação declarada no schema, mas
**nenhum serviço ou controller jamais cria uma linha com ela preenchida**.
`handleWebhookAssinatura` só muda o status da assinatura; o dinheiro da
assinatura não deixa rastro no banco.

Duas consequências para o plano:

1. **A ref interna da seção 4 não existe.** Não há linha de pagamento de
   assinatura para referenciar, então a regra "1 pagamento → no máximo 1 nota"
   não tem como ser ancorada.
2. **`assinaturaId` sozinho seria a ref errada de qualquer forma.** Assinatura
   é recorrente: são doze notas por ano, uma por competência. A ref precisa ser
   o pagamento, ou `assinaturaId + competência` — senão a segunda mensalidade
   não emite nota e a idempotência "funciona" escondendo o problema.

### 9.3. Renovação é invisível

No webhook, quando uma assinatura **já ATIVA** renova, `periodoFim` é estendido
mas nenhum aviso é disparado: o `dispatch` de renovação está atrás de
`assinatura.status !== 'ATIVA'`. Não há notificação, não há registro — e é
justamente o evento que mais precisa gerar nota.

### 9.4. Pré-requisito antes da integração

Registrar o pagamento da assinatura no webhook: uma linha `Pagamento` com
`assinaturaId`, valor, `mpPaymentId` e a competência. É bookkeeping que já
deveria existir — hoje não dá para responder "quanto a assinatura faturou no
mês passado" pelo banco — e é o que dá à emissão onde se pendurar.

Independe de qualquer provedor, então pode ser feito antes ou durante a POC.

### 9.5. Tabela nova, não a mesma

Os campos da seção 4 descrevem a **nota emitida** e pedem uma tabela própria
(`NotaFiscal`). Ela não se confunde com `DadosFiscais`, que descreve o
**tomador**. As duas são necessárias e não se sobrepõem.
