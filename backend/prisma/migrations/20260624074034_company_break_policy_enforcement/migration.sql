-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'AUTO_PUNCHED_OUT';

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "autoPunchOutReason" TEXT;

-- AlterTable
ALTER TABLE "BreakLog" ADD COLUMN     "allowedMinutes" INTEGER,
ADD COLUMN     "autoPunchOutAt" TIMESTAMP(3),
ADD COLUMN     "breakPolicyId" UUID,
ADD COLUMN     "breakTypeCode" TEXT,
ADD COLUMN     "breakTypeName" TEXT,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "isPaid" BOOLEAN,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "policyViolated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BreakPolicy" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "allowedMinutes" INTEGER NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoPunchOutOnTimeout" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "employeeId" UUID,

    CONSTRAINT "BreakPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreakPolicy_companyId_idx" ON "BreakPolicy"("companyId");

-- CreateIndex
CREATE INDEX "BreakPolicy_companyId_code_idx" ON "BreakPolicy"("companyId", "code");

-- CreateIndex
CREATE INDEX "BreakPolicy_companyId_isActive_idx" ON "BreakPolicy"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "BreakPolicy_deletedAt_idx" ON "BreakPolicy"("deletedAt");

-- CreateIndex
CREATE INDEX "BreakLog_breakPolicyId_idx" ON "BreakLog"("breakPolicyId");

-- CreateIndex
CREATE INDEX "BreakLog_policyViolated_idx" ON "BreakLog"("policyViolated");

-- AddForeignKey
ALTER TABLE "BreakLog" ADD CONSTRAINT "BreakLog_breakPolicyId_fkey" FOREIGN KEY ("breakPolicyId") REFERENCES "BreakPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakPolicy" ADD CONSTRAINT "BreakPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakPolicy" ADD CONSTRAINT "BreakPolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
