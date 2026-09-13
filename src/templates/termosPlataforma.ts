/**
 * Os termos de uso da plataforma e o aviso de privacidade — VIU ↔ usuário.
 *
 * Documento diferente do anexo de revisão, e a confusão entre os dois era o
 * defeito: o produto gravava "fulano aceitou os termos" ao criar um projeto,
 * apontando para um `termoVersao: "1.0"` que não existia em lugar nenhum. Dava
 * para provar o clique e não o que a pessoa leu — e ainda por cima no momento
 * errado, porque o que rege escopo, rodadas e propriedade intelectual é o
 * anexo do projeto, que nem existe quando o projeto é criado.
 *
 * O que se aceita aqui é a relação com o VIU: conta, ferramenta, dados,
 * responsabilidade do software. Por isso o aceite é no CADASTRO.
 *
 * Mora no repositório e não no banco pelo mesmo motivo do anexo: é texto que
 * rege responsabilidade, então passa por code review e a versão fica amarrada
 * a um commit. Trocar uma cláusula é um diff que alguém aprova, não um UPDATE.
 *
 * ⚠️ PENDENTE DE REVISÃO JURÍDICA. Rascunho estruturado a partir do esboço do
 * próprio time, que veio com a ressalva de não ser assessoria jurídica.
 * Nenhuma linha foi validada por advogado — LGPD, relação de consumo e
 * prestação de serviço precisam de leitura profissional antes de isto valer
 * como defesa. `TERMOS_REVISADOS_JURIDICAMENTE` sai `false` enquanto for
 * assim, e a tela lê de lá: o aviso some sozinho quando a revisão chegar, sem
 * depender de alguém lembrar de apagá-lo.
 */

import { createHash } from 'crypto'

/**
 * A versão do texto.
 *
 * É o que fica gravado em `AceiteTermos.versao` e responde "o que exatamente
 * esta pessoa aceitou". Sobe a cada mudança de redação — dois textos
 * diferentes sob o mesmo identificador destroem justamente isso.
 */
export const TERMOS_VERSAO = 'termos-plataforma@1'

/** O texto ainda não passou por advogado. Vira `true` numa versão futura. */
export const TERMOS_REVISADOS_JURIDICAMENTE = false

/**
 * Texto puro, não markdown, pelo mesmo motivo do anexo: o hash cobre
 * exatamente o que a pessoa leu. Um `**` na tela significaria que ela
 * concordou com o renderizado enquanto o hash guardava o fonte.
 */
export const TEXTO_TERMOS = `TERMOS DE USO DO VIU E AVISO DE PRIVACIDADE

Versão ${TERMOS_VERSAO}

⚠️ ESTE TEXTO ESTÁ PENDENTE DE REVISÃO JURÍDICA. Ele descreve de boa-fé como a
plataforma funciona, mas ainda não foi validado por advogado.


1. QUEM SOMOS

1.1. O VIU é uma ferramenta online para enviar, revisar e registrar feedback e
aprovação de peças de design.

1.2. O VIU não é escritório de advocacia e não presta assessoria jurídica.

1.3. O VIU não é parte do contrato de prestação de serviço entre designer e
cliente. Quando houver cobrança pela plataforma, ela é meio de registro e de
pagamento, e as obrigações do serviço de design seguem entre as partes.


2. CONTAS

2.1. O cadastro exige dados verdadeiros.

2.2. Designer e Cliente são tipos de conta com permissões diferentes.

2.3. Você é responsável pela sua senha, pelo seu e-mail e por quem recebe os
links que você gera.


3. O QUE O VIU FAZ

3.1. Hospeda arquivos, versões, comentários, links de revisão e registros de
status — entre eles aprovações, pedidos de ajuste e o número da versão sobre a
qual cada comentário foi feito.

3.2. Envia e-mails transacionais: verificação de conta, notificações de
atividade e avisos de cobrança.

3.3. Registra a data, o endereço de IP e o navegador de atos que servem de
prova — aceites e aprovações — porque é isso que os torna oponíveis depois.


4. O QUE O VIU NÃO FAZ

4.1. Não garante que uma pessoa "viu" nada além do que o sistema registrou.

4.2. Não substitui contrato de design, briefing ou nota fiscal entre as partes.

4.3. Não garante disponibilidade ininterrupta, especialmente durante o beta.


5. CONTEÚDO E PROPRIEDADE INTELECTUAL

5.1. As artes, textos e comentários continuam de quem os enviou, ou das partes
do projeto conforme o acordo entre elas. O VIU não adquire titularidade sobre
o trabalho.

5.2. Você concede ao VIU licença limitada para armazenar, exibir e processar
esse conteúdo no que for necessário para operar o serviço.

5.3. É proibido enviar conteúdo ilegal, ofensivo ou que viole direito de
terceiros.


6. LINKS COMPARTILHADOS

6.1. Quem gera um link controla o alcance dele. Um link encaminhado continua
funcionando para quem o receber.

6.2. Ler pelo link é aberto. Comentar e aprovar exigem conta, porque são atos
que ficam registrados em nome de alguém.


7. PAGAMENTOS

7.1. A assinatura do VIU, paga pelo designer, é coisa distinta do pagamento do
projeto de design, que é entre designer e cliente.

7.2. Sobre faturas emitidas pela plataforma, o VIU retém a taxa do plano do
designer e repassa o restante. O valor e a taxa aparecem na própria fatura
antes do envio.

7.3. Saques, estornos e disputas seguem as regras publicadas no produto no
momento de cada operação.


8. BETA E LIMITAÇÃO DE RESPONSABILIDADE

8.1. O serviço está em evolução. Recursos mudam, limites de uso existem e podem
mudar.

8.2. Mantemos backups de rotina, sem garantia de recuperação integral em caso
de falha.

8.3. A responsabilidade do VIU limita-se ao valor que você pagou à plataforma
nos 3 meses anteriores ao evento — e é zero para contas gratuitas.


9. DADOS PESSOAIS (LGPD)

9.1. O controlador dos dados da sua conta é a empresa responsável pelo VIU.

9.2. Tratamos dados para criar e manter a conta, operar o serviço, garantir
segurança e prestar suporte.

9.3. Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados
pelo canal de contato publicado no produto.

9.4. Guardamos os dados enquanto a conta existir e, depois dela, apenas o que
obrigação legal exigir — entre isso, os registros de aceite e de pagamento.

9.5. Compartilhamos dados apenas com quem opera o serviço: provedor de
hospedagem, de armazenamento de arquivos, de envio de e-mail e de pagamento.


10. ENCERRAMENTO

10.1. Você pode pedir a exclusão da conta a qualquer momento.

10.2. O VIU pode suspender contas por uso abusivo ou ilegal, avisando quando
for possível.


11. FORO

11.1. Aplica-se a lei brasileira, no foro da sede da empresa responsável pelo
VIU.
`

/**
 * O sha256 do texto vigente.
 *
 * Calculado uma vez, no carregamento do módulo: é constante para um dado
 * commit, e recalcular a cada aceite gastaria CPU para chegar ao mesmo valor.
 * Fica gravado no aceite para que a prova sobreviva a uma alteração futura do
 * arquivo — o mesmo raciocínio de `hashAceito` no contrato do projeto.
 */
export const HASH_TERMOS = createHash('sha256').update(TEXTO_TERMOS, 'utf8').digest('hex')
