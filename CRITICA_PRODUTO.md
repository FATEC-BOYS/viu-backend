# Crítica brutal do VIU — análise de fundador para fundador

> Documento produzido a pedido: o objetivo aqui NÃO é validar a ideia, é encontrar os
> motivos pelos quais ela pode fracassar. Baseado no mercado, no comportamento real de
> designers e clientes no Brasil, e no estado atual do código deste repositório.

---

## Veredito em uma frase

A dor existe, mas ela é do usuário errado: quem sofre (o designer) não é quem precisa
mudar de comportamento (o cliente dele), e quem precisa mudar de comportamento não paga
nada e não ganha nada com a mudança. Enquanto essa assimetria não for resolvida, o VIU é
uma ferramenta que o designer assina empolgado no mês 1 e cancela no mês 3 — e o código
deste repositório mostra que vocês estão construindo uma plataforma inteira em cima de
uma hipótese que nunca foi validada com dinheiro.

---

## 0. Antes da ideia: o que o código já denuncia

Isso não estava na sua pergunta, mas é o risco mais concreto que encontrei, porque não é
hipotético — está commitado.

O prompt descreve "upload → link → comentário → aprovação → histórico". O repositório
contém: sistema de faturas com pagamento via PIX, ledger financeiro com estornos,
saques, disputas, planos e assinaturas, equipes, tarefas, prazos, notificações, 2FA,
feedback por áudio com transcrição via Whisper, e um TECH_DEBT.md com auditoria de IDOR
pendente. São 20+ rotas de dashboard no frontend.

Ou seja: **vocês estão construindo um Frame.io + um gateway de pagamento + um
marketplace de disputa antes de ter validado que alguém paga pelo fluxo de aprovação.**
Cada uma dessas frentes (dinheiro em custódia, disputa, saque) é um produto inteiro, com
risco regulatório e de fraude próprios, e nenhuma delas resolve a pergunta central: *o
cliente do designer vai clicar no link ou vai responder no WhatsApp?*

Isso é o padrão clássico de fracasso por engenharia: o time é bom de código (o repo é
organizado, tem testes, tem runbook de deploy), então construir é mais confortável do
que validar. O produto morre pronto.

---

## 1. O problema é grande o suficiente para alguém pagar?

**Para a maioria do seu público declarado: não.**

A dor é real — todo designer já perdeu horas caçando "aprovado 👍" no meio de 300
mensagens de WhatsApp, e já refez arte porque o cliente aprovou uma versão e cobrou
outra. Mas dor real ≠ dor pagável. Três testes que a ideia falha:

- **Frequência × intensidade:** a dor aguda (disputa sobre "quem aprovou o quê") é rara
  — acontece algumas vezes por ano. A dor frequente (desorganização) é crônica e
  tolerada, como bagunça de gaveta. Pessoas pagam por dor aguda e frequente; toleram
  dor crônica e leve.
- **O workaround é gratuito, instantâneo e universal:** WhatsApp + Google Drive + Canva
  custam R$ 0 e o cliente já está lá. Seu concorrente real não é a Filestage, é o botão
  de encaminhar do WhatsApp.
- **A dor só vira dinheiro em volume:** com 2–3 clientes, o freelancer administra o caos
  de cabeça. A dor só justifica assinatura a partir de ~5+ clientes ativos com múltiplas
  peças por semana — e esse recorte é muito menor do que "designers freelancers".

## 2. Quem sofre MAIS com esse problema?

Em ordem real de intensidade:

1. **Agências de social media com 10–40 clientes ativos** — 20–30 posts/mês por
   cliente, cada um com ciclo de aprovação. É dor diária, com funcionário dedicado a
   "cobrar aprovação". É o único segmento onde a dor é aguda E frequente E há orçamento.
2. **Pequenas agências de branding/design** com entregas de maior valor (a disputa de
   "você aprovou isso" custa caro).
3. **Times de marketing interno** que precisam de aprovação jurídica/compliance
   (regulados: farma, financeiro) — dor fortíssima, mas esse mercado já é da Ziflow e
   exige enterprise sales que vocês não têm.
4. Por último: **o freelancer solo** — exatamente o topo da sua lista de público-alvo.
   Ele sofre, mas sofre pouco, esporadicamente, e tem a menor capacidade de pagamento.

**Sua ordem de público está invertida.** O freelancer é o mais fácil de alcançar e o
pior para monetizar; a agência é o contrário.

## 3. Quem NÃO pagaria?

- **Freelancers iniciantes / com 1–3 clientes:** a dor não justifica custo fixo mensal
  sobre uma renda irregular. No Brasil, o teto psicológico do freelancer para ferramenta
  é R$ 30–50/mês, e ele cancela no primeiro mês fraco.
- **Social medias que vivem dentro do Canva:** o Canva já tem link de
  compartilhamento com comentários. "Bom o suficiente" e grátis mata "melhor mas pago".
- **Times de marketing de empresas médias/grandes:** compras (procurement) não aprova
  SaaS desconhecido de fornecedor sem CNPJ robusto, SLA, LGPD formalizada. Esse público
  no seu prompt é fantasia nesta fase.
- **Qualquer um cujo cliente final se recusa a usar link** — e isso é o item 4.

## 4. O que faria o cliente continuar no WhatsApp?

Tudo. Essa é a pergunta mais importante da sua lista e a resposta é devastadora:

- O cliente final **não ganha nada** usando o VIU. A organização beneficia o designer;
  para o cliente, clicar num link, esperar carregar, aprender uma interface nova é só
  fricção. Ele responde "aprovado" no WhatsApp em 4 segundos, do banheiro.
- **Assimetria de poder:** o designer não manda no cliente. Quando o cliente (que paga o
  designer) responde no WhatsApp, o designer vai insistir "usa a plataforma, por favor"?
  Não — ele engole e anota. No terceiro cliente que ignora o link, o designer cancela a
  assinatura, porque a ferramenta virou trabalho dobrado: registrar no VIU o que
  aconteceu no WhatsApp.
- No Brasil, WhatsApp não é um canal, é O canal. Notificação por e-mail (que é o que
  plataformas desse tipo usam) tem taxa de abertura ridícula aqui.
- Áudio: o cliente brasileiro manda áudio de 2 minutos. Vocês claramente sabem disso
  (tem Whisper no backend) — mas transcrever áudio *dentro da plataforma* não resolve,
  porque o áudio vai chegar *no WhatsApp do designer*, não no VIU.

## 5. Em quais cenários a plataforma é abandonada em dias?

1. **O primeiro cliente do designer ignora o link** e responde no WhatsApp. O designer
   passa a manter dois sistemas → abandona o pago. (Cenário mais provável, semana 1–2.)
2. O cliente clica no link e **encontra cadastro/login/senha**. Qualquer barreira antes
   do comentário mata a adoção do lado que não paga.
3. O designer tem um **mês fraco** e corta assinaturas. Ferramenta de freelancer tem
   churn sazonal brutal.
4. **Upload lento / arquivo pesado / preview quebrado** (PSD, PDF multipágina, vídeo).
   Uma falha de preview na frente do cliente do designer é humilhação — ele não volta.
5. O designer percebe que **Canva/Figma/Drive já fazem 80%** do que ele precisa, grátis.
6. Trial acaba antes de o designer ter um ciclo completo de aprovação com cliente real
   (ciclos de aprovação duram semanas; trials duram 7–14 dias).

## 6. Concorrentes diretos e indiretos

**Diretos (proofing/aprovação):** Filestage, Ziflow, GoVisually, ReviewStudio, Approval
Studio, Pastel, Markup.io, Frame.io (Adobe, para vídeo), Punchlist. Alguns têm free tier.

**Diretos no Brasil (gestão de agência com módulo de aprovação):** Operand, iClips e
similares — já vendem para exatamente as agências que são seu melhor segmento, embutidos
num pacote maior (financeiro, tarefas, timesheet).

**Indiretos (os que realmente matam):**
- **Canva** — link de compartilhamento com comentário, grátis, e é onde o social media
  já cria a peça. Se o Canva lançar "aprovar/reprovar com registro" (distância de um
  sprint para eles), seu produto principal evapora.
- **Figma** — comentário posicional é o padrão-ouro e é grátis para viewer.
- **Google Drive/PDF comentado, Notion, Trello** — "bom o suficiente".
- **WhatsApp** — o incumbente de verdade, market share ~100%.

## 7. O que os concorrentes já fazem melhor?

Praticamente tudo do seu escopo atual: anotação posicional em imagem/PDF/vídeo/site ao
vivo (Ziflow/Filestage), comparação de versões lado a lado com sobreposição, workflows
de aprovação multi-etapa com regras, trilha de auditoria com validade formal,
integrações (Slack, Teams, Asana, Adobe CC), SOC 2, revisor sem cadastro, apps mobile.
Dez anos de refinamento. Vocês não vão vencer por checklist de funcionalidade — e o
repo sugere que é exatamente isso que estão tentando (ver seção 0).

## 8. Qual seria o VERDADEIRO diferencial do VIU?

Hoje, olhando o que existe: **nenhum defensável.** "Feito no Brasil, em português, mais
barato" não é diferencial, é posicionamento — copiável em uma tarde.

Os únicos diferenciais possíveis que eu compraria:

1. **WhatsApp como interface do cliente final, não como inimigo.** O cliente aprova
   *dentro do WhatsApp* (mensagem com a arte + botões aprovar/pedir ajuste via API
   oficial do WhatsApp Business), e o VIU registra do outro lado: versão, quem, quando,
   o quê. O cliente não muda comportamento nenhum; o designer ganha o registro. Nenhum
   player global vai fazer isso bem porque WhatsApp não é o centro do fluxo lá fora.
   **Este é o produto, na minha opinião — ver item 17.**
2. Aprovação atrelada a **consequência financeira** ("aprovou → libera pagamento/etapa
   do contrato") — vocês já construíram metade disso com PIX/faturas, mas como
   plataforma de custódia, que é um negócio muito mais perigoso. Como *recibo de
   aprovação que protege o designer em disputa* (documento com hash, carimbo de tempo),
   é mais simples e mais vendável.

## 9. Existe mudança de comportamento difícil demais?

Sim, e é a fatal: **a mudança exigida é de quem não é usuário pagante nem tem
incentivo.** O designer adotaria fácil (a dor é dele). Mas o produto só funciona se o
*cliente do designer* — que não escolheu a ferramenta, não paga por ela e não ganha nada
— abandonar o WhatsApp para clicar em links. Vocês não têm nenhum mecanismo de coerção
ou incentivo sobre essa pessoa. Produtos com essa estrutura (o pagante precisa convencer
um terceiro sem incentivo) morrem de churn mesmo com NPS alto do pagante.

## 10. Hipóteses escondidas que você está assumindo

1. "O cliente final vai clicar no link e comentar lá." ← a mais perigosa.
2. "O designer valoriza organização mais do que odeia fricção com o cliente dele."
3. "O registro de quem aprovou tem valor percebido *antes* da primeira briga" (na
   prática, as pessoas só valorizam seguro depois do incêndio).
4. "Freelancer brasileiro sustenta assinatura mensal em renda irregular."
5. "A aprovação é o momento certo de entrar no fluxo" — talvez o problema monetizável
   esteja antes (briefing ruim) ou depois (cobrança), não no meio.
6. "Ser mais simples que Filestage é vantagem" — simplicidade sem distribuição é só
   menos funcionalidade.
7. Escondida no código: "precisamos de billing, disputa, saque e 2FA para lançar." Não
   precisam. Isso é hipótese de escopo, e está custando meses.

## 11. Maiores riscos de fracasso (ordenados)

1. **Churn estrutural** pela assimetria pagante/usuário (itens 4 e 9). Probabilidade
   alta, letal.
2. **Mercado-alvo sem capacidade de pagamento** (freelancer BR) → CAC nunca fecha com
   LTV. Alto, letal.
3. **Morte por escopo:** meses construindo plataforma financeira pré-PMF; o dinheiro/
   energia acaba antes da validação. Já está acontecendo.
4. **"Bom o suficiente" grátis** (Canva/Figma/Drive) comprime o preço a zero. Médio-alto.
5. Incumbente lança a feature (Canva aprovação com registro). Médio, letal se ocorrer.
6. Risco regulatório/fraude do lado financeiro (custódia, estorno, disputa) — vocês
   viraram fintech sem perceber. Médio, caro.

## 12. Como validar gastando menos de R$ 500

- **R$ 0 — Concierge sem produto:** pegue 5 designers/agências conhecidos e rode o fluxo
  de aprovação *manualmente* por 2 semanas (você mesmo monta o link no Drive, cobra o
  cliente final, registra aprovação numa planilha). Meça: % de clientes finais que
  usam o link vs. respondem no WhatsApp. Esse número único valida ou mata a ideia.
- **R$ 0 — 20 entrevistas** (item 13) recrutadas em grupos de designers/social media no
  WhatsApp/Facebook/Instagram.
- **~R$ 100–300 — Landing page com preço visível e botão "Assinar"** (não "entrar na
  lista"). Tráfego de anúncio barato segmentado. Meça cliques em *assinar com preço na
  tela*, não cadastros de e-mail.
- **R$ 0 — Pré-venda real:** ofereça plano fundador anual (ex.: R$ 297/ano) por PIX
  antes de dar acesso. 10 pagamentos = sinal. 0 pagamento em 50 conversas = resposta.
- **R$ 0 — Teste do bot:** simule a aprovação via WhatsApp manualmente (você manda a
  arte com "responda 1 para aprovar") para clientes finais de designers parceiros e
  meça taxa/tempo de resposta versus o link. Compara as duas teses com dados.

## 13. Que entrevistas fazer

- 10 donos/gerentes de **agência de social media** (5–40 clientes) — seu melhor segmento.
- 5 **freelancers com 5+ clientes ativos** (não iniciantes — eles não vão pagar nunca).
- 5 **clientes finais** (dono de restaurante, gerente de marketing de PME — quem aprova
  arte). Ninguém entrevista o lado que precisa mudar de comportamento; entreviste.
- 3 pessoas que **já assinaram e cancelaram** Filestage/Operand/similar. Ex-churners
  contam onde o valor quebra.

## 14. Perguntas que evitam o "parece legal" (Mom Test)

Sobre o passado, nunca sobre o futuro. Nunca descreva sua ideia antes do fim.

- "Me conta a última vez que uma aprovação de arte deu errado. O que aconteceu? Quanto
  custou (horas, retrabalho, cliente perdido)?"
- "O que você faz *hoje* quando o cliente some sem aprovar? Me mostra a conversa."
- "Você já tentou alguma ferramenta pra isso? Qual? Por que parou de usar?" ← a
  resposta a essa pergunta vale mais que as outras todas.
- "Quanto você paga hoje, somando tudo, em ferramentas do seu trabalho?" (ancora a
  capacidade real de pagamento)
- "Se isso existisse hoje por R$ 79/mês, você assina *agora*? Posso te mandar o PIX?"
  — a única validação é dinheiro ou compromisso concreto (agenda de onboarding,
  carta de intenção). "Assinaria sim!" sem PIX = não.
- Para o cliente final: "Quando o designer te manda um link pra você comentar a arte
  fora do WhatsApp, o que você faz?" (deixe ele rir.)

## 15. O que me faria desistir completamente

- Nas entrevistas com clientes finais, maioria diz/demonstra que ignora links e responde
  no canal onde recebeu.
- Concierge mostra < 40% de aprovações acontecendo dentro do fluxo mesmo com você
  empurrando manualmente.
- 50 conversas de venda com preço real → menos de 5 pagamentos antecipados.
- Piloto pago com churn > 8–10%/mês nos primeiros 90 dias.
- Descobrir que as agências (único segmento bom) já estão contratualmente presas a
  Operand/iClips e a aprovação isolada não justifica ferramenta extra.

## 16. O que precisaria acontecer para eu acreditar em R$ 100 mil de MRR

Primeiro, a matemática fria: R$ 100k MRR com freelancer a R$ 49/mês = **~2.000 clientes
pagantes**; com churn de 6%/mês (otimista para o segmento) você precisa repor 120
clientes/mês só para ficar parado. Isso não existe para SaaS nichado brasileiro vendido
a freelancer. **Com freelancers, esquece.**

O caminho crível é outro: **agências, com preço por volume.** 250–350 agências pagando
R$ 300–500/mês (por assento ou por cliente-marca gerenciado). Para eu investir, exigiria:

1. 10 agências pagando sem desconto, com **uso semanal do cliente final delas** (não do
   admin) por 90 dias;
2. Churn < 3%/mês nesse piloto;
3. Evidência de que o cliente final aprova dentro do fluxo em > 70% dos ciclos —
   provando que vocês resolveram o problema do item 9 (provavelmente via WhatsApp);
4. Um motivo estrutural para o Canva/Operand não matar vocês num sprint (o mais
   plausível: profundidade na API oficial do WhatsApp Business + trilha de auditoria);
5. CAC recuperado em < 6 meses num canal repetível (não indicação de amigo).

## 17. Se eu fosse atacar o mesmo problema, o que eu construiria

**Não uma plataforma para onde o cliente vai. Uma camada invisível sobre onde o cliente
já está.**

O produto: **aprovação via WhatsApp com registro auditável.** O designer/agência sobe a
arte (ou conecta o Drive/Canva); o VIU envia ao cliente final *pelo WhatsApp* (API
oficial, template com preview + botões "Aprovar / Pedir ajuste"); a resposta — inclusive
áudio, transcrito com o Whisper que vocês já integraram — vira registro estruturado:
versão, autor, data/hora, conteúdo, exportável em PDF com carimbo de tempo para anexar
ao contrato. Cobrança automática de aprovação pendente ("follow-up educado") pelo mesmo
canal, que é a tarefa que as agências mais odeiam.

Por que isso é melhor que o VIU atual:

- **Zero mudança de comportamento do cliente final** — elimina o risco nº 1.
- O pagante (agência) recebe o valor inteiro sem depender de adoção de terceiros.
- Nenhum player global fará isso bem tão cedo; Canva/Figma não vão virar bot de WhatsApp.
- Reaproveita o que vocês já construíram: upload, versões, aprovações, áudio+Whisper,
  links públicos. Joga fora (ou congela) o que não deveria existir ainda: faturas, PIX,
  ledger, saques, disputas, planos.
- Preço por mensagem/volume escala com o uso da agência — melhor unit economics que
  assinatura fixa de freelancer.

Riscos próprios dessa versão (para ser honesto até com a minha alternativa): custo e
burocracia da API oficial do WhatsApp Business, risco de plataforma (Meta muda regras),
e templates de mensagem precisam de aprovação da Meta. Validável com R$ 0: rode o fluxo
manualmente pelo WhatsApp normal com 5 agências parceiras antes de escrever uma linha.

---

## Matriz de hipóteses

| # | Hipótese | Prob. de estar errada | Impacto se errada | Como validar rápido | Custo | Decisão |
|---|----------|----------------------|-------------------|---------------------|-------|---------|
| 1 | O cliente final sai do WhatsApp para comentar/aprovar num link | **Alta (70–80%)** | Fatal | Concierge: 5 designers, 2 semanas, medir % de aprovações no link vs. WhatsApp | R$ 0 | **Ajustar** — inverta: leve a aprovação para dentro do WhatsApp (item 17) |
| 2 | Freelancers pagam assinatura mensal por isso | **Alta (70%)** | Fatal p/ o segmento | Pré-venda por PIX em 50 conversas com preço real | R$ 0 | **Abandonar o segmento** — freelancer é canal de divulgação, não cliente |
| 3 | Agências de social media pagam R$ 300+/mês por volume de aprovação | Média (40–50%) | Alto (é o único segmento viável) | 10 entrevistas Mom Test + 3 pilotos concierge pagos | R$ 0–200 | **Continuar** — é a aposta principal; validar antes de mais código |
| 4 | Registro de "quem aprovou e quando" tem valor pagável | Média (50%) | Médio (vira feature, não produto) | Perguntar por disputas passadas e quanto custaram; oferecer "recibo de aprovação" avulso | R$ 0 | Ajustar — vender como proteção/recibo, não como histórico |
| 5 | Feedback por áudio transcrito é diferencial | Média (50%) | Baixo | Só tem valor se o áudio chegar pelo canal certo (WhatsApp) | R$ 0 | Ajustar — mover para o fluxo WhatsApp |
| 6 | Precisamos de billing/PIX/ledger/disputas/saques para lançar | **Altíssima (90%)** | Alto (meses de burn + risco fintech) | Nenhuma validação necessária — é escopo, não mercado | R$ 0 | **Abandonar/congelar já** — usar Stripe/gateway pronto quando (e se) houver pagantes |
| 7 | "Mais simples e em português" vence Filestage/Canva/Operand | Alta (70%) | Alto | Entrevistar 3 ex-usuários dessas ferramentas: por que saíram? | R$ 0 | Ajustar — diferencial tem que ser canal (WhatsApp), não simplicidade |
| 8 | Cliente final aceita aprovar via botão no WhatsApp | Baixa–média (30%) | Alto (é a tese alternativa) | Simular manualmente com WhatsApp normal em 5 agências, medir taxa/tempo de resposta | R$ 0 | **Validar primeiro** — se confirmar, é o produto |
| 9 | Existe canal de aquisição repetível com CAC < 6 meses de receita | Média (50%) | Fatal em escala | Landing + R$ 300 de anúncio segmentado p/ agências, medir custo por conversa de venda | R$ 300 | Continuar — testar só depois das hipóteses 3 e 8 |

**Leitura da matriz:** a ideia como está descrita (plataforma-destino para onde o
cliente é convidado a ir) tem duas hipóteses fatais com alta probabilidade de erro (1 e
2) — eu não colocaria meu dinheiro nela. O mesmo problema, atacado como camada sobre o
WhatsApp vendida a agências (hipóteses 3 e 8), tem risco normal de startup e reaproveita
a maior parte do que vocês já construíram. A primeira coisa a fazer não é código: é
parar de escrever código por duas semanas e rodar o concierge das hipóteses 1, 3 e 8.
