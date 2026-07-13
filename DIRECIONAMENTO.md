# Direcionamento do VIU (v2)

> Documento de direcionamento de produto. Substitui a visão original de "plataforma de
> aprovação de artes" como destino. Contexto e justificativa: ver `CRITICA_PRODUTO.md`.

## A tese

> **O VIU não é uma plataforma de aprovação. É uma camada de inteligência que organiza
> um processo que já acontece no WhatsApp.**

Essa frase define o posicionamento, o MVP e até quem são os concorrentes: saímos da
prateleira das ferramentas de proofing (Filestage, Ziflow) e entramos num campo onde
as plataformas de atendimento sobre WhatsApp não entendem de aprovação criativa — e as
ferramentas de aprovação criativa não entendem de WhatsApp.

## Princípios

**Princípio nº 1 — O cliente final nunca deve aprender a usar o VIU.**
Se ele percebe que está usando uma plataforma nova, falhamos. Consequências práticas:
login → não; cadastro → não; aplicativo → não; tutorial → não. Qualquer funcionalidade
que viole este princípio não entra no MVP, por definição.

**Princípio nº 2 — Kill rápido, confirmação paciente.**
Uma hipótese claramente morta é abandonada em dias, não em meses. Um sinal positivo
pequeno não é tratado como prova — seis pessoas gostando pode ser sorte. Decisões de
matar são rápidas; decisões de investir pesado exigem confirmação.

---

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

Antes de desenvolver novas funcionalidades precisamos responder cinco perguntas.
As Hipóteses 0, 1 e 2 vêm **antes** do MVP — nenhuma delas precisa de código.

**Hipótese 0** — A agência consegue fazer o cliente responder no formato proposto —
e o que acontece quando ele não responde?
*Por que vem antes de tudo:* determina o desenho do sistema inteiro. Se os clientes
respondem naturalmente a "✅ 1 = aprovar / ✏️ 2 = pedir alteração", ótimo. Se respondem
"tá bom", "pode mudar aquele azul" ou mandam áudio, o produto não pode obrigar formato
— tem que entender qualquer resposta.
*Como validar:* observar as respostas reais durante o concierge (é a mesma rodada da
Hipótese 2, com olhar diferente: a H2 mede SE o cliente responde no fluxo; a H0 mede
COMO ele responde).
*Duas notas de calibração:*

1. **O concierge é um teste mais difícil que o produto real.** No WhatsApp comum,
   "responda 1" depende de disciplina do cliente; na API oficial existem botões
   interativos nativos — o cliente toca em "Aprovar", não digita. Se a H0 passar no
   formato pobre do concierge, o produto real será mais fácil. A implicação de design
   vale mesmo assim: **resposta estruturada é o caminho feliz; resposta livre é normal,
   nunca erro.** O sistema trata botão, texto livre e áudio (Whisper) como entradas
   igualmente válidas.
2. **Aprovação inferida ≠ aprovação registrada.** "Comprovar quem aprovou e quando" —
   valor central do produto — enfraquece se a aprovação for inferida por IA de um "tá
   bom". Regra de design: quando a resposta for livre, o sistema interpreta e devolve
   um toque de confirmação ("Entendi que você aprovou a Arte X v3 — confirma? ✅").
   Inferência para conveniência, confirmação para registro. Sem isso, a trilha de
   auditoria não vale nada numa disputa — e ninguém indica (Hipótese 4) uma ferramenta
   que "achou" que o cliente aprovou.

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

**v2.2** — Consolidação do discovery:

1. Tese reformulada como abertura do documento: "não é uma plataforma de aprovação, é
   uma camada de inteligência sobre um processo que já acontece no WhatsApp".
2. Seção de Princípios criada: nº 1 "o cliente final nunca deve aprender a usar o VIU"
   (sem login, cadastro, app ou tutorial — por definição); nº 2 "kill rápido,
   confirmação paciente".
3. Adicionada Hipótese 0 (formato de resposta do cliente final), com duas regras de
   design derivadas: resposta livre é normal e nunca erro; aprovação inferida de texto
   livre exige toque de confirmação para preservar a trilha de auditoria.

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
