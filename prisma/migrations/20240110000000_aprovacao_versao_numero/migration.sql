-- Aprovação passa a registrar QUAL entrega foi decidida.
--
-- Número, não FK para arte_versoes: createArte não cria linha lá, então a v1 de
-- toda arte ficaria com referência nula — justamente o caso mais comum.
ALTER TABLE "aprovacoes" ADD COLUMN "versaoNumero" INTEGER;

-- Trava a duplicata que o botão "Solicitar aprovação" produz com dois cliques.
-- Sem ela, a rota de decisão (que busca com limit=1 e pega [0]) aplicaria a
-- resposta do cliente numa linha arbitrária, deixando a outra PENDENTE para
-- sempre.
--
-- Postgres trata NULLs como distintos num índice único, então as linhas
-- antigas (versaoNumero NULL) nunca conflitam entre si: esta migration é
-- segura sobre dados existentes. Quem cobre o caso NULL é a idempotência do
-- service.
CREATE UNIQUE INDEX "aprovacoes_arteId_aprovadorId_versaoNumero_key"
  ON "aprovacoes"("arteId", "aprovadorId", "versaoNumero");
