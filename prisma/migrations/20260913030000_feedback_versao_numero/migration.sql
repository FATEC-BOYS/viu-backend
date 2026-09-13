-- Sobre qual versão da arte cada comentário foi feito.
--
-- A cláusula 3.2 do anexo de revisão define rodada como "o conjunto de
-- feedbacks do Cliente sobre uma mesma versão, consolidado até a próxima versão
-- enviada pelo Designer". Sem esta coluna, isso só se obtinha deduzindo por
-- `criadoEm` — e a dedução erra exatamente na hora que vira discussão: o
-- comentário escrito enquanto o designer sobe a versão nova é atribuído à
-- versão errada.
--
-- Número e não chave estrangeira, pelo mesmo motivo já documentado em
-- `Aprovacao.versaoNumero`: `createArte` não gera linha em `ArteVersao`, então
-- a v1 de toda arte ficaria com FK nula — justamente o caso mais comum.
--
-- SEM BACKFILL, DE PROPÓSITO.
--
-- Seria possível inferir o legado ("a maior ArteVersao criada antes do
-- criadoEm do feedback"), e a inferência acertaria na maioria. O problema não é
-- a taxa de acerto: é que, depois de gravado, um palpite fica indistinguível de
-- um registro. Numa disputa, "a v2 tem 4 comentários" misturaria o que foi
-- medido com o que foi deduzido por uma regra escrita hoje — e este dado existe
-- justamente para servir de prova. Linha antiga fica NULL e a interface diz
-- "sem versão registrada"; comentário novo grava a verdade desde o primeiro.
--
-- O índice (arteId, versaoNumero) serve à contagem por rodada.

-- AlterTable
ALTER TABLE "feedbacks" ADD COLUMN     "versaoNumero" INTEGER;

-- CreateIndex
CREATE INDEX "feedbacks_arteId_versaoNumero_idx" ON "feedbacks"("arteId", "versaoNumero");

