# Direcionamento do VIU (v2)

> Documento de direcionamento de produto. Substitui a visão original de "plataforma de
> aprovação de artes" como destino. Contexto e justificativa: ver `CRITICA_PRODUTO.md`.

Após analisar os riscos do produto, decidimos mudar o foco do VIU.

## O problema não mudou

Agências e designers continuam sofrendo com:

- aprovações espalhadas entre WhatsApp, e-mail e ligações;
- versões perdidas;
- clientes que desaparecem;
- retrabalho;
- dificuldade de comprovar quem aprovou determinada versão.

## O que mudou

Percebemos que o erro era tentar levar o cliente para uma nova plataforma.

O cliente final já está no WhatsApp. Não queremos mudar esse comportamento.
Queremos trabalhar em cima dele.

## Nova proposta de valor

> **O VIU será a camada que organiza aprovações feitas pelo WhatsApp.**

- Para o cliente final, praticamente nada muda: ele continua respondendo no WhatsApp.
- Para a agência, tudo fica organizado automaticamente.

---

## MVP

O MVP terá apenas o necessário.

### Agência

- Cadastro
- Upload da arte
- Controle de versões
- Lista de clientes
- Dashboard simples

### Cliente final

Recebe tudo pelo WhatsApp. Pode:

- Aprovar
- Solicitar alteração
- Enviar mensagem
- Enviar áudio

Sem login. Sem cadastro. Sem instalar aplicativo.

### IA

Quando houver áudio:

- transcrever automaticamente;
- vincular à versão correta;
- gerar histórico.

### Funcionalidades do MVP

- Upload
- Versionamento
- Aprovação
- Solicitação de alteração
- Histórico
- Lembretes automáticos
- Exportação em PDF

**Nada além disso.**

---

## O que NÃO faremos agora

Ficam congelados:

- Marketplace
- PIX
- Ledger financeiro
- Saques
- Disputas
- Sistema financeiro
- Funcionalidades enterprise
- Recursos que não ajudam a conseguir os primeiros clientes

---

## Modelo de negócio

### Plano gratuito

- 1 agência
- até 3 clientes
- 100 aprovações
- WhatsApp
- Histórico básico

### Plano pago

- Clientes ilimitados
- Aprovações ilimitadas
- Lembretes automáticos
- IA
- Exportações
- Relatórios

---

## Próxima validação

Antes de desenvolver novas funcionalidades precisamos responder apenas três perguntas.

**Hipótese 1** — As agências aceitariam pagar por uma plataforma que organiza
aprovações feitas pelo WhatsApp?

**Hipótese 2** — Os clientes realmente aprovam usando o WhatsApp sem necessidade de
abrir outro sistema?

**Hipótese 3** — Quanto tempo a agência economiza por mês usando o VIU?

## Critério de sucesso

O objetivo do MVP não é lançar um SaaS completo. É conseguir:

- 10 agências utilizando semanalmente.
- Pelo menos 5 pagando.
- Churn baixo.
- Uso recorrente.

Só depois disso começaremos a investir em funcionalidades maiores.

---

## Riscos e decisões em aberto

Pontos levantados na revisão crítica deste direcionamento. Não alteram as decisões
acima, mas precisam de resposta antes ou durante o MVP.

### 1. O plano gratuito tem custo marginal real

Cada aprovação enviada pela API oficial do WhatsApp Business custa dinheiro (a Meta
cobra por conversa iniciada por template). "100 aprovações grátis" significa pagar a
conta de WhatsApp de quem talvez nunca pague o VIU. Alternativas a decidir: trial de
14–30 dias com tudo liberado, ou free tier de ~10 aprovações — o suficiente para provar
o valor uma vez, não para operar de graça indefinidamente.

### 2. A Hipótese 3 não é mensurável como está escrita

"Quanto tempo economiza" vira chute educado em entrevista. Substituir por proxies que o
próprio sistema registra:

- tempo médio entre envio da arte e aprovação (antes/depois do VIU);
- número de follow-ups manuais evitados (lembretes automáticos disparados);
- % de ciclos de aprovação concluídos sem a agência precisar cobrar fora do fluxo.

### 3. Sequência: as Hipóteses 1 e 2 vêm ANTES do MVP, não depois

O MVP inteiro depende das hipóteses 1 e 2, mas nenhuma das duas precisa de código para
ser testada. Antes de encarar API da Meta, aprovação de templates e custo por mensagem:

- **Hipótese 2 (concierge, R$ 0, 2 semanas):** enviar artes de agências parceiras pelo
  WhatsApp comum com "responda 1 para aprovar", registrar resultado em planilha. Medir
  taxa e tempo de resposta.
- **Hipótese 1 (pré-venda, R$ 0):** oferecer o serviço com preço real em 20–50 conversas
  com agências; contar pagamentos antecipados/compromissos concretos, não "assinaria sim".

Se a Hipótese 2 falhar no concierge, o MVP não deve ser construído.

### 4. Critérios de sucesso precisam de número

"Churn baixo" e "uso recorrente" aceitam qualquer resultado. Proposta:

- churn < 5%/mês durante o piloto;
- uso recorrente = agência envia artes para aprovação em pelo menos 3 de cada 4 semanas;
- > 70% das aprovações dos clientes finais concluídas dentro do fluxo WhatsApp.

### 5. Risco de plataforma (Meta)

O produto passa a depender da API oficial do WhatsApp Business: templates sujeitos a
aprovação da Meta, preços por conversa que mudam, risco de bloqueio de número por
denúncia de spam. Mitigações mínimas no MVP: usar BSP estabelecido, templates
conservadores, opt-in explícito do cliente final no primeiro contato.
