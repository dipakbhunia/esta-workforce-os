-- CreateEnum
CREATE TYPE "LeaveApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LeaveApprovalHistory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "leaveRequestId" UUID NOT NULL,
    "action" "LeaveApprovalAction" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApprovalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveApprovalHistory_companyId_createdAt_idx" ON "LeaveApprovalHistory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveApprovalHistory_leaveRequestId_createdAt_idx" ON "LeaveApprovalHistory"("leaveRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveApprovalHistory_actorUserId_createdAt_idx" ON "LeaveApprovalHistory"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeaveApprovalHistory" ADD CONSTRAINT "LeaveApprovalHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalHistory" ADD CONSTRAINT "LeaveApprovalHistory_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprovalHistory" ADD CONSTRAINT "LeaveApprovalHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
