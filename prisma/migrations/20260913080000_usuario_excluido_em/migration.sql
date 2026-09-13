-- A data da exclusão da conta (LGPD Art. 18 IV).
--
-- A anonimização já existia e funcionava: nome, e-mail, telefone, avatar, senha
-- e segredos de 2FA viram dado neutro, as sessões caem, e os registros
-- financeiros ficam por obrigação fiscal. O que faltava era DIZER QUANDO.
--
-- Sem esta coluna sobrava `ativo: false`, que não distingue conta excluída de
-- conta desativada e não carrega data nenhuma — então o painel não tinha como
-- mostrar o atendimento ao pedido, que é justamente o que precisa ser
-- demonstrável depois.
--
-- A data não é dado pessoal do titular: é registro de que o pedido dele foi
-- atendido, e em que momento.
--
-- Nula para trás: contas desativadas antes disto continuam sendo o que sempre
-- foram. Preencher por heurística inventaria uma data de exclusão que ninguém
-- pode confirmar — e este é exatamente o tipo de campo que não aceita palpite.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "excluidoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "usuarios_excluidoEm_idx" ON "usuarios"("excluidoEm");

