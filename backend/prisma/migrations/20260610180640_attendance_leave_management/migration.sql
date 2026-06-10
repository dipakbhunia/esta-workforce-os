-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceLogType" AS ENUM ('PUNCH_IN', 'PUNCH_OUT');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Attendance" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "punchInAt" TIMESTAMP(3),
    "punchOutAt" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "expectedMinutes" INTEGER NOT NULL,
    "shiftStartTime" TEXT NOT NULL,
    "shiftEndTime" TEXT NOT NULL,
    "shiftTimezone" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "type" "AttendanceLogType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakLog" (
    "id" UUID NOT NULL,
    "attendanceId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "BreakLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "defaultDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "managerCanApprove" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_companyId_attendanceDate_idx" ON "Attendance"("companyId", "attendanceDate");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_attendanceDate_idx" ON "Attendance"("employeeId", "attendanceDate");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_attendanceDate_key" ON "Attendance"("employeeId", "attendanceDate");

-- CreateIndex
CREATE INDEX "AttendanceLog_attendanceId_occurredAt_idx" ON "AttendanceLog"("attendanceId", "occurredAt");

-- CreateIndex
CREATE INDEX "BreakLog_attendanceId_startedAt_idx" ON "BreakLog"("attendanceId", "startedAt");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_idx" ON "LeaveType"("companyId");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_code_idx" ON "LeaveType"("companyId", "code");

-- CreateIndex
CREATE INDEX "LeaveType_deletedAt_idx" ON "LeaveType"("deletedAt");

CREATE UNIQUE INDEX "LeaveType_active_companyId_code_key"
ON "LeaveType"("companyId", "code")
WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_status_idx" ON "LeaveRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_idx" ON "LeaveRequest"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_leaveTypeId_idx" ON "LeaveRequest"("leaveTypeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_deletedAt_idx" ON "LeaveRequest"("deletedAt");

-- CreateIndex
CREATE INDEX "LeaveBalance_companyId_year_idx" ON "LeaveBalance"("companyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("employeeId", "leaveTypeId", "year");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakLog" ADD CONSTRAINT "BreakLog_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
