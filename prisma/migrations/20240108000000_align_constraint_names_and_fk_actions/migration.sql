-- Alinha o banco ao schema.prisma.
--
-- 1. Nomes de índices e constraints: a baseline os declarou sem aspas, então
--    o Postgres guardou tudo minúsculo (projetoid_idx) enquanto o Prisma
--    espera projetoId_idx. Renomeia, não recria.
--
-- 2. Ações referenciais: 16 FKs ficaram com ON UPDATE NO ACTION onde o schema
--    declara ON UPDATE CASCADE, e assinaturas_planoId ficou com NO ACTION onde
--    o schema pede RESTRICT. Essas precisam ser recriadas.

-- DropForeignKey
ALTER TABLE "aceites_contratuais" DROP CONSTRAINT "aceites_contratuais_projetoid_fkey";

-- DropForeignKey
ALTER TABLE "aceites_contratuais" DROP CONSTRAINT "aceites_contratuais_usuarioid_fkey";

-- DropForeignKey
ALTER TABLE "assinaturas" DROP CONSTRAINT "assinaturas_planoid_fkey";

-- DropForeignKey
ALTER TABLE "assinaturas" DROP CONSTRAINT "assinaturas_usuarioid_fkey";

-- DropForeignKey
ALTER TABLE "chaves_pix" DROP CONSTRAINT "chaves_pix_usuarioid_fkey";

-- DropForeignKey
ALTER TABLE "disputas" DROP CONSTRAINT "disputas_abertaporid_fkey";

-- DropForeignKey
ALTER TABLE "disputas" DROP CONSTRAINT "disputas_faturaid_fkey";

-- DropForeignKey
ALTER TABLE "disputas" DROP CONSTRAINT "disputas_projetoid_fkey";

-- DropForeignKey
ALTER TABLE "faturas" DROP CONSTRAINT "faturas_clienteid_fkey";

-- DropForeignKey
ALTER TABLE "faturas" DROP CONSTRAINT "faturas_designerid_fkey";

-- DropForeignKey
ALTER TABLE "faturas" DROP CONSTRAINT "faturas_projetoid_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos" DROP CONSTRAINT "pagamentos_assinaturaid_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos" DROP CONSTRAINT "pagamentos_faturaid_fkey";

-- DropForeignKey
ALTER TABLE "pagamentos" DROP CONSTRAINT "pagamentos_usuarioid_fkey";

-- DropForeignKey
ALTER TABLE "saques" DROP CONSTRAINT "saques_chavepixid_fkey";

-- DropForeignKey
ALTER TABLE "saques" DROP CONSTRAINT "saques_designerid_fkey";

-- RenameForeignKey
ALTER TABLE "aprovacoes" RENAME CONSTRAINT "aprovacoes_aprovadorid_fkey" TO "aprovacoes_aprovadorId_fkey";

-- RenameForeignKey
ALTER TABLE "aprovacoes" RENAME CONSTRAINT "aprovacoes_arteid_fkey" TO "aprovacoes_arteId_fkey";

-- RenameForeignKey
ALTER TABLE "artes" RENAME CONSTRAINT "artes_autorid_fkey" TO "artes_autorId_fkey";

-- RenameForeignKey
ALTER TABLE "artes" RENAME CONSTRAINT "artes_projetoid_fkey" TO "artes_projetoId_fkey";

-- RenameForeignKey
ALTER TABLE "audit_logs" RENAME CONSTRAINT "audit_logs_usuarioid_fkey" TO "audit_logs_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "equipe_membros" RENAME CONSTRAINT "equipe_membros_equipeid_fkey" TO "equipe_membros_equipeId_fkey";

-- RenameForeignKey
ALTER TABLE "equipe_membros" RENAME CONSTRAINT "equipe_membros_usuarioid_fkey" TO "equipe_membros_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "equipes" RENAME CONSTRAINT "equipes_donoprincipalid_fkey" TO "equipes_donoPrincipalId_fkey";

-- RenameForeignKey
ALTER TABLE "feedbacks" RENAME CONSTRAINT "feedbacks_arteid_fkey" TO "feedbacks_arteId_fkey";

-- RenameForeignKey
ALTER TABLE "feedbacks" RENAME CONSTRAINT "feedbacks_autorid_fkey" TO "feedbacks_autorId_fkey";

-- RenameForeignKey
ALTER TABLE "link_compartilhado" RENAME CONSTRAINT "link_compartilhado_arteid_fkey" TO "link_compartilhado_arteId_fkey";

-- RenameForeignKey
ALTER TABLE "notificacoes" RENAME CONSTRAINT "notificacoes_usuarioid_fkey" TO "notificacoes_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "projetos" RENAME CONSTRAINT "projetos_clienteid_fkey" TO "projetos_clienteId_fkey";

-- RenameForeignKey
ALTER TABLE "projetos" RENAME CONSTRAINT "projetos_designerid_fkey" TO "projetos_designerId_fkey";

-- RenameForeignKey
ALTER TABLE "projetos" RENAME CONSTRAINT "projetos_equipeid_fkey" TO "projetos_equipeId_fkey";

-- RenameForeignKey
ALTER TABLE "security_events" RENAME CONSTRAINT "security_events_usuarioid_fkey" TO "security_events_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "sessoes" RENAME CONSTRAINT "sessoes_usuarioid_fkey" TO "sessoes_usuarioId_fkey";

-- RenameForeignKey
ALTER TABLE "tarefas" RENAME CONSTRAINT "tarefas_projetoid_fkey" TO "tarefas_projetoId_fkey";

-- RenameForeignKey
ALTER TABLE "tarefas" RENAME CONSTRAINT "tarefas_responsavelid_fkey" TO "tarefas_responsavelId_fkey";

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "assinaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chaves_pix" ADD CONSTRAINT "chaves_pix_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saques" ADD CONSTRAINT "saques_chavePixId_fkey" FOREIGN KEY ("chavePixId") REFERENCES "chaves_pix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_contratuais" ADD CONSTRAINT "aceites_contratuais_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_contratuais" ADD CONSTRAINT "aceites_contratuais_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_abertaPorId_fkey" FOREIGN KEY ("abertaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "aceites_contratuais_projetoid_idx" RENAME TO "aceites_contratuais_projetoId_idx";

-- RenameIndex
ALTER INDEX "aceites_contratuais_usuarioid_idx" RENAME TO "aceites_contratuais_usuarioId_idx";

-- RenameIndex
ALTER INDEX "aceites_contratuais_usuarioid_projetoid_key" RENAME TO "aceites_contratuais_usuarioId_projetoId_key";

-- RenameIndex
ALTER INDEX "aprovacoes_aprovadorid_idx" RENAME TO "aprovacoes_aprovadorId_idx";

-- RenameIndex
ALTER INDEX "aprovacoes_arteid_idx" RENAME TO "aprovacoes_arteId_idx";

-- RenameIndex
ALTER INDEX "aprovacoes_criadoem_idx" RENAME TO "aprovacoes_criadoEm_idx";

-- RenameIndex
ALTER INDEX "artes_autorid_idx" RENAME TO "artes_autorId_idx";

-- RenameIndex
ALTER INDEX "artes_criadoem_idx" RENAME TO "artes_criadoEm_idx";

-- RenameIndex
ALTER INDEX "artes_projetoid_idx" RENAME TO "artes_projetoId_idx";

-- RenameIndex
ALTER INDEX "assinaturas_mppreapprovalid_key" RENAME TO "assinaturas_mpPreapprovalId_key";

-- RenameIndex
ALTER INDEX "assinaturas_usuarioid_idx" RENAME TO "assinaturas_usuarioId_idx";

-- RenameIndex
ALTER INDEX "audit_logs_criadoem_idx" RENAME TO "audit_logs_criadoEm_idx";

-- RenameIndex
ALTER INDEX "audit_logs_usuarioid_idx" RENAME TO "audit_logs_usuarioId_idx";

-- RenameIndex
ALTER INDEX "chaves_pix_usuarioid_idx" RENAME TO "chaves_pix_usuarioId_idx";

-- RenameIndex
ALTER INDEX "disputas_abertaporid_idx" RENAME TO "disputas_abertaPorId_idx";

-- RenameIndex
ALTER INDEX "disputas_projetoid_idx" RENAME TO "disputas_projetoId_idx";

-- RenameIndex
ALTER INDEX "equipe_membros_usuarioid_idx" RENAME TO "equipe_membros_usuarioId_idx";

-- RenameIndex
ALTER INDEX "equipes_donoprincipalid_idx" RENAME TO "equipes_donoPrincipalId_idx";

-- RenameIndex
ALTER INDEX "faturas_clienteid_idx" RENAME TO "faturas_clienteId_idx";

-- RenameIndex
ALTER INDEX "faturas_designerid_idx" RENAME TO "faturas_designerId_idx";

-- RenameIndex
ALTER INDEX "faturas_projetoid_idx" RENAME TO "faturas_projetoId_idx";

-- RenameIndex
ALTER INDEX "feedbacks_arteid_idx" RENAME TO "feedbacks_arteId_idx";

-- RenameIndex
ALTER INDEX "feedbacks_autorid_idx" RENAME TO "feedbacks_autorId_idx";

-- RenameIndex
ALTER INDEX "feedbacks_criadoem_idx" RENAME TO "feedbacks_criadoEm_idx";

-- RenameIndex
ALTER INDEX "link_compartilhado_arteid_idx" RENAME TO "link_compartilhado_arteId_idx";

-- RenameIndex
ALTER INDEX "link_compartilhado_expiraem_idx" RENAME TO "link_compartilhado_expiraEm_idx";

-- RenameIndex
ALTER INDEX "notificacoes_criadoem_idx" RENAME TO "notificacoes_criadoEm_idx";

-- RenameIndex
ALTER INDEX "notificacoes_usuarioid_idx" RENAME TO "notificacoes_usuarioId_idx";

-- RenameIndex
ALTER INDEX "pagamentos_faturaid_key" RENAME TO "pagamentos_faturaId_key";

-- RenameIndex
ALTER INDEX "pagamentos_mppaymentid_idx" RENAME TO "pagamentos_mpPaymentId_idx";

-- RenameIndex
ALTER INDEX "pagamentos_mppaymentid_key" RENAME TO "pagamentos_mpPaymentId_key";

-- RenameIndex
ALTER INDEX "pagamentos_usuarioid_idx" RENAME TO "pagamentos_usuarioId_idx";

-- RenameIndex
ALTER INDEX "projetos_clienteid_idx" RENAME TO "projetos_clienteId_idx";

-- RenameIndex
ALTER INDEX "projetos_criadoem_idx" RENAME TO "projetos_criadoEm_idx";

-- RenameIndex
ALTER INDEX "projetos_designerid_idx" RENAME TO "projetos_designerId_idx";

-- RenameIndex
ALTER INDEX "projetos_equipeid_idx" RENAME TO "projetos_equipeId_idx";

-- RenameIndex
ALTER INDEX "saques_designerid_idx" RENAME TO "saques_designerId_idx";

-- RenameIndex
ALTER INDEX "saques_mppayoutid_key" RENAME TO "saques_mpPayoutId_key";

-- RenameIndex
ALTER INDEX "security_events_criadoem_idx" RENAME TO "security_events_criadoEm_idx";

-- RenameIndex
ALTER INDEX "security_events_eventtype_idx" RENAME TO "security_events_eventType_idx";

-- RenameIndex
ALTER INDEX "security_events_usuarioid_idx" RENAME TO "security_events_usuarioId_idx";

-- RenameIndex
ALTER INDEX "sessoes_expiresat_idx" RENAME TO "sessoes_expiresAt_idx";

-- RenameIndex
ALTER INDEX "sessoes_refreshtoken_idx" RENAME TO "sessoes_refreshToken_idx";

-- RenameIndex
ALTER INDEX "sessoes_refreshtoken_key" RENAME TO "sessoes_refreshToken_key";

-- RenameIndex
ALTER INDEX "sessoes_usuarioid_idx" RENAME TO "sessoes_usuarioId_idx";

-- RenameIndex
ALTER INDEX "tarefas_projetoid_idx" RENAME TO "tarefas_projetoId_idx";

-- RenameIndex
ALTER INDEX "tarefas_responsavelid_idx" RENAME TO "tarefas_responsavelId_idx";

-- RenameIndex
ALTER INDEX "usuarios_criadoem_idx" RENAME TO "usuarios_criadoEm_idx";

-- RenameIndex
ALTER INDEX "usuarios_emailvertoken_key" RENAME TO "usuarios_emailVerificacaoToken_key";

-- RenameIndex
ALTER INDEX "usuarios_pwdresettoken_key" RENAME TO "usuarios_passwordResetToken_key";

