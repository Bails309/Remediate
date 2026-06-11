-- Track bulk-comment batches so comments posted together can be edited / deleted together.
ALTER TABLE "Comment" ADD COLUMN "batchId" UUID;
CREATE INDEX "Comment_batchId_idx" ON "Comment"("batchId");
