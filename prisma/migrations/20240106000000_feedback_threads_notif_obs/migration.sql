-- Feedback threads: parentId (self-referential) + resolvidoEm + resolvidoPor
ALTER TABLE "feedbacks"
  ADD COLUMN "parentId"     TEXT,
  ADD COLUMN "resolvidoEm"  TIMESTAMP(3),
  ADD COLUMN "resolvidoPor" TEXT;

CREATE INDEX "feedbacks_parentId_idx" ON "feedbacks"("parentId");

ALTER TABLE "feedbacks"
  ADD CONSTRAINT "feedbacks_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "feedbacks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
