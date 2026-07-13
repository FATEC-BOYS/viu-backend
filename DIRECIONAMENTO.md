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

### Posicionamento

Não vendemos "plataforma de aprovação". As duas frases oficiais, com papéis distintos:

- **Frase de produto (site, pitch):** "Aprovação de artes sem tirar seu cliente do WhatsApp."
- **Frase de dor (anúncio, headline):** "Nunca mais perca uma aprovação no WhatsApp."

Descartado: "O CRM das aprovações" — jargão que exige tradução do comprador.

O posicionamento definitivo virá do piloto: a frase literal que as agências usarem ao
responder "o que você diria ao indicar o VIU?" (ver Hipótese 4) substitui as frases
acima se for mais forte.

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

> Nota: não existe plano gratuito permanente. Cada aprovação via WhatsApp tem custo
> marginal real (Meta cobra por conversa iniciada por template), então o free tier é
> porta de entrada, não modo de operação.

### Entrada gratuita (escolher um dos dois formatos no piloto)

- **Trial de 14 dias** com tudo liberado; ou
- **10 aprovações grátis** — o suficiente para provar o valor uma vez.

### Plano pago

- Clientes ilimitados
- Aprovações ilimitadas
- Lembretes automáticos
- IA
- Exportações
- Relatórios

---

## Próxima validação

Antes de desenvolver novas funcionalidades precisamos responder quatro perguntas.
As Hipóteses 1 e 2 vêm **antes** do MVP — nenhuma das duas precisa de código.

**Hipótese 1** — As agências aceitariam pagar por uma plataforma que organiza
aprovações feitas pelo WhatsApp?
*Como validar:* pré-venda com preço real em 20–50 conversas; contar pagamentos
antecipados e compromissos concretos, não "assinaria sim".

**Hipótese 2** — Os clientes realmente aprovam usando o WhatsApp sem abrir outro
sistema?
*Como validar:* concierge por WhatsApp comum ("responda 1 para aprovar") com agências
parceiras, registrando tudo em planilha. **Regra assimétrica de duração: 1 semana para
matar** — se ninguém responder no fluxo ou todos continuarem respondendo do jeito
antigo, acabou, sem segunda semana. **Se o sinal for positivo, estender +1 semana**
antes de escrever código, porque ciclos reais de aprovação atravessam semanas e poucos
dados positivos podem ser sorte. Kill rápido, confirmação paciente. Se esta hipótese
falhar, o MVP não deve ser construído.

**Hipótese 3** — O VIU reduz mensuravelmente o ciclo de aprovação?
*Métricas objetivas (registradas pelo próprio sistema, não por percepção):*

- tempo médio entre envio da arte e aprovação (antes/depois);
- quantidade de follow-ups manuais por aprovação;
- taxa de aprovação concluída dentro do fluxo;
- % das aprovações que deixaram de se perder fora do fluxo.

**Hipótese 4** — Por que uma agência indicaria o VIU para outra?
*Por que importa:* a resposta define o CAC. "Porque organiza" = fraca (crescimento só
por anúncio pago). "Porque reduziu meu retrabalho em 40%" = interessante. "Porque meu
cliente finalmente aprova sem eu cobrar cinco vezes" = proposta de valor forte e
crescimento por indicação.
*Como validar:* ao fim de cada trial do piloto, perguntar "você indicaria? para quem?
o que você diria?" e **anotar a frase literal** — a frase espontânea da agência é o
posicionamento real do produto.

## Critérios para continuar

O objetivo do MVP não é lançar um SaaS completo. Após o piloto, investimos pesado
somente se **todos** os critérios abaixo forem atingidos:

- ≥ 70% das aprovações acontecem pelo fluxo do VIU.
- ≥ 5 agências aceitam pagar após o trial (de ~10 no piloto).
- Churn < 5% ao mês no piloto.
- Cada agência usa em pelo menos 3 das últimas 4 semanas.
- O tempo médio até aprovação reduz em pelo menos 30%.

Se os critérios não forem atingidos, voltamos às hipóteses — não às funcionalidades.

---

## Riscos em aberto

### Risco de plataforma (Meta)

O produto passa a depender da API oficial do WhatsApp Business: templates sujeitos a
aprovação da Meta, preços por conversa que mudam, risco de bloqueio de número por
denúncia de spam. Mitigações mínimas no MVP: usar BSP estabelecido, templates
conservadores, opt-in explícito do cliente final no primeiro contato.

---

## Histórico de decisões

**v2.1** — Refinamentos após revisão crítica, todos incorporados ao corpo do documento:

1. Plano gratuito permanente substituído por trial de 14 dias ou 10 aprovações (custo
   marginal por mensagem do WhatsApp inviabiliza free tier operacional).
2. Hipótese 3 reescrita com métricas objetivas registradas pelo sistema, em vez de
   "tempo economizado" autodeclarado.
3. Concierge das Hipóteses 1 e 2 posicionado ANTES do MVP, com regra assimétrica de
   duração: 1 semana para matar, +1 semana para confirmar sinal positivo.
4. Critérios de sucesso quantificados (seção "Critérios para continuar").
5. Adicionada Hipótese 4 (motivo de indicação → define CAC) e seção de posicionamento
   com as duas frases oficiais; "CRM das aprovações" descartado por ser jargão.

**v2** — Pivô de plataforma-destino para camada de aprovação sobre o WhatsApp, vendida
a agências. Congelamento do escopo financeiro/marketplace. Justificativa completa em
`CRITICA_PRODUTO.md`.
