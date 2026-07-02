-- CreateEnum
CREATE TYPE "AttendanceCorrectionType" AS ENUM ('MISSED_PUNCH_IN', 'MISSED_PUNCH_OUT', 'TIME_CORRECTION', 'FULL_DAY_REGULARIZATION');

-- CreateEnum
CREATE TYPE "AttendanceCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AttendanceCorrectionRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "reviewedByUserId" UUID,
    "type" "AttendanceCorrectionType" NOT NULL,
    "status" "AttendanceCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "originalPunchInAt" TIMESTAMP(3),
    "originalPunchOutAt" TIMESTAMP(3),
    "requestedPunchInAt" TIMESTAMP(3),
    "requestedPunchOutAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "reviewerComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_companyId_status_createdAt_idx" ON "AttendanceCorrectionRequest"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_attendanceId_idx" ON "AttendanceCorrectionRequest"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_employeeId_status_idx" ON "AttendanceCorrectionRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_requestedByUserId_createdAt_idx" ON "AttendanceCorrectionRequest"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_reviewedByUserId_reviewedAt_idx" ON "AttendanceCorrectionRequest"("reviewedByUserId", "reviewedAt");

-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_deletedAt_idx" ON "AttendanceCorrectionRequest"("deletedAt");

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
