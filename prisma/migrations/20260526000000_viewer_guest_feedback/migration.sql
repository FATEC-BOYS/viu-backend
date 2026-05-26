-- Make autorId nullable in feedbacks (allows guest/viewer feedback without account)
ALTER TABLE "feedbacks" ALTER COLUMN "autor_id" DROP NOT NULL;

-- Add guest identification fields to feedbacks
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "guest_nome" TEXT;
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "guest_email" TEXT;

-- Add canComment flag to shared links
ALTER TABLE "link_compartilhado" ADD COLUMN IF NOT EXISTS "can_comment" BOOLEAN NOT NULL DEFAULT true;
