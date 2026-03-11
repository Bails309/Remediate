-- CreateTable
CREATE TABLE "AssignmentNotification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "vulnerabilityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "AssignmentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentNotification_userId_sentAt_idx" ON "AssignmentNotification"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "AssignmentNotification" ADD CONSTRAINT "AssignmentNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentNotification" ADD CONSTRAINT "AssignmentNotification_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "Vulnerability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
