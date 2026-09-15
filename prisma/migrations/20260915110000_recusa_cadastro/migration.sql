-- "Não fui eu": quem foi cadastrado por um designer sem ter pedido precisa de
-- um caminho que funcione sozinho, e não de um e-mail pedindo para responder.
--
-- Token próprio e não o de verificação: confirmar a conta e recusá-la são
-- ações opostas disparadas pelo mesmo e-mail, e compartilhar o segredo faria
-- uma virar a outra por engano. Guardamos o hash — o cru só existe no e-mail.
ALTER TABLE "usuarios" ADD COLUMN "recusaCadastroToken" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "recusaCadastroExpiraEm" TIMESTAMP(3);

CREATE UNIQUE INDEX "usuarios_recusaCadastroToken_key" ON "usuarios"("recusaCadastroToken");
