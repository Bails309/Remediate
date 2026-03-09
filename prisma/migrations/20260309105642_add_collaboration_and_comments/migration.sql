-- AlterTable
ALTER TABLE "Vulnerability" ADD COLUMN     "askForHelp" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "vulnerabilityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Collaborators" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_Collaborators_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Comment_vulnerabilityId_createdAt_idx" ON "Comment"("vulnerabilityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "_Collaborators_B_index" ON "_Collaborators"("B");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Collaborators" ADD CONSTRAINT "_Collaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
