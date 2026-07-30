-- CreateEnum
CREATE TYPE "ShiftAssignmentStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShiftAssignmentType" AS ENUM ('PERMANENT', 'TEMPORARY', 'ROTATIONAL', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('EMPLOYEE_PROFILE', 'SHIFT_ASSIGNMENT', 'ROSTER', 'SYSTEM', 'IMPORT');

-- CreateTable
CREATE TABLE "EmployeeShiftAssignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "ShiftAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignmentType" "ShiftAssignmentType" NOT NULL DEFAULT 'PERMANENT',
    "source" "AssignmentSource" NOT NULL DEFAULT 'SHIFT_ASSIGNMENT',
    "reason" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Attendance"
  ADD COLUMN "shiftId" UUID,
  ADD COLUMN "shiftAssignmentId" UUID,
  ADD COLUMN "shiftName" TEXT,
  ADD COLUMN "shiftCode" TEXT;

-- CreateIndex
CREATE INDEX "EmployeeShiftAssignment_companyId_employeeId_effectiveFrom_idx" ON "EmployeeShiftAssignment"("companyId", "employeeId", "effectiveFrom");
CREATE INDEX "EmployeeShiftAssignment_employeeId_effectiveFrom_effectiveTo_idx" ON "EmployeeShiftAssignment"("employeeId", "effectiveFrom", "effectiveTo");
CREATE INDEX "EmployeeShiftAssignment_companyId_status_idx" ON "EmployeeShiftAssignment"("companyId", "status");
CREATE INDEX "EmployeeShiftAssignment_shiftId_idx" ON "EmployeeShiftAssignment"("shiftId");
CREATE INDEX "EmployeeShiftAssignment_createdById_idx" ON "EmployeeShiftAssignment"("createdById");
CREATE INDEX "EmployeeShiftAssignment_updatedById_idx" ON "EmployeeShiftAssignment"("updatedById");
CREATE INDEX "EmployeeShiftAssignment_deletedAt_idx" ON "EmployeeShiftAssignment"("deletedAt");
CREATE INDEX "Attendance_shiftId_idx" ON "Attendance"("shiftId");
CREATE INDEX "Attendance_shiftAssignmentId_idx" ON "Attendance"("shiftAssignmentId");

-- AddForeignKey
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeShiftAssignment" ADD CONSTRAINT "EmployeeShiftAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftAssignmentId_fkey" FOREIGN KEY ("shiftAssignmentId") REFERENCES "EmployeeShiftAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
