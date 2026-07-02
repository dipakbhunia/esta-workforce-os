CREATE UNIQUE INDEX "AttendanceCorrectionRequest_pending_unique"
ON "AttendanceCorrectionRequest"("attendanceId", "employeeId")
WHERE "status" = 'PENDING' AND "deletedAt" IS NULL;
