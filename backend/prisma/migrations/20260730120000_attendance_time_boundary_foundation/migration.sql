-- CreateEnum
CREATE TYPE "AttendanceCloseSource" AS ENUM ('EMPLOYEE', 'ADMIN', 'SYSTEM', 'CORRECTION');

-- CreateEnum
CREATE TYPE "AttendanceCloseReason" AS ENUM ('NORMAL_PUNCH_OUT', 'HEARTBEAT_TIMEOUT', 'MISSED_PUNCH_OUT', 'MAX_SESSION_EXCEEDED', 'DEVICE_OFFLINE', 'SYSTEM_SHUTDOWN_UNCONFIRMED', 'ADMIN_CORRECTION', 'BREAK_DURATION_EXCEEDED', 'PREVIOUS_DAY_AUTO_CLOSE');

-- AlterTable
ALTER TABLE "Attendance"
  ADD COLUMN "workDate" DATE,
  ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3),
  ADD COLUMN "closeSource" "AttendanceCloseSource",
  ADD COLUMN "closeReason" "AttendanceCloseReason",
  ADD COLUMN "autoClosedAt" TIMESTAMP(3),
  ADD COLUMN "systemClosedAt" TIMESTAMP(3),
  ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastReliableActivityAt" TIMESTAMP(3);

-- Backfill existing attendance rows so new readers can prefer workDate safely.
UPDATE "Attendance"
SET "workDate" = "attendanceDate"
WHERE "workDate" IS NULL;

-- AlterTable
ALTER TABLE "AttendancePolicy"
  ADD COLUMN "autoCloseEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "disconnectGraceMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "postShiftGraceMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "maximumOpenSessionMinutes" INTEGER NOT NULL DEFAULT 960,
  ADD COLUMN "noHeartbeatFallbackMinutes" INTEGER NOT NULL DEFAULT 720;

-- CreateIndex
CREATE INDEX "Attendance_companyId_workDate_idx" ON "Attendance"("companyId", "workDate");
CREATE INDEX "Attendance_employeeId_workDate_idx" ON "Attendance"("employeeId", "workDate");
CREATE INDEX "Attendance_punchOutAt_idx" ON "Attendance"("punchOutAt");
CREATE INDEX "Attendance_requiresReview_idx" ON "Attendance"("requiresReview");
