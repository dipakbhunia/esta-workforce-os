-- DropIndex
DROP INDEX "Attendance_employeeId_attendanceDate_key";

-- AlterTable
ALTER TABLE "AttendancePolicy" ADD COLUMN     "allowMultiplePunchSessions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendanceDayStartTime" TEXT NOT NULL DEFAULT '00:00',
ADD COLUMN     "autoClosePreviousDayOpenSession" BOOLEAN NOT NULL DEFAULT true;
