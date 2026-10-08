ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_CORRECTION_APPLIED';

ALTER TABLE "Company"
ADD COLUMN "designatedAttendanceApproverUserId" UUID;

ALTER TABLE "AttendanceCorrectionRequest"
ADD COLUMN "assignedApproverUserId" UUID,
ADD COLUMN "approvalAuthorityVersion" INTEGER;

ALTER TABLE "Company"
ADD CONSTRAINT "Company_designatedAttendanceApproverUserId_fkey"
FOREIGN KEY ("designatedAttendanceApproverUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
ADD CONSTRAINT "AttendanceCorrectionRequest_assignedApproverUserId_fkey"
FOREIGN KEY ("assignedApproverUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceCorrectionRequest"
ADD CONSTRAINT "AttendanceCorrectionRequest_approval_authority_consistency_check"
CHECK (
  ("approvalAuthorityVersion" IS NULL AND "assignedApproverUserId" IS NULL)
  OR
  ("approvalAuthorityVersion" = 1 AND "assignedApproverUserId" IS NOT NULL)
);

CREATE INDEX "AttendanceCorrection_assignedApprover_status_idx"
ON "AttendanceCorrectionRequest"("companyId", "assignedApproverUserId", "status");
