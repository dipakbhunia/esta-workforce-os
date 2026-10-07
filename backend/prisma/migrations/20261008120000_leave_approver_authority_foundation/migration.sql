ALTER TABLE "Company"
ADD COLUMN "designatedLeaveApproverUserId" UUID;

ALTER TABLE "LeaveRequest"
ADD COLUMN "assignedApproverUserId" UUID,
ADD COLUMN "approvalAuthorityVersion" INTEGER;

ALTER TABLE "Company"
ADD CONSTRAINT "Company_designatedLeaveApproverUserId_fkey"
FOREIGN KEY ("designatedLeaveApproverUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_assignedApproverUserId_fkey"
FOREIGN KEY ("assignedApproverUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest"
ADD CONSTRAINT "LeaveRequest_approval_authority_consistency_check"
CHECK (
  (
    "approvalAuthorityVersion" IS NULL
    AND "assignedApproverUserId" IS NULL
  )
  OR
  (
    "approvalAuthorityVersion" IS NOT NULL
    AND "approvalAuthorityVersion" = 1
    AND "assignedApproverUserId" IS NOT NULL
  )
);

CREATE INDEX "LeaveRequest_companyId_assignedApproverUserId_status_idx"
ON "LeaveRequest"("companyId", "assignedApproverUserId", "status");
