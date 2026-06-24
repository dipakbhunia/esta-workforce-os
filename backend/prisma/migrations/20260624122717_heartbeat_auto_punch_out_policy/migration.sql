-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "autoPunchOutOnHeartbeatLoss" BOOLEAN NOT NULL DEFAULT true,
    "heartbeatTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendancePolicy_companyId_isActive_idx" ON "AttendancePolicy"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
