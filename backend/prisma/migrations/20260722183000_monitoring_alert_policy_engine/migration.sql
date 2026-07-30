CREATE TYPE "MonitoringAlertPolicyScope" AS ENUM ('SYSTEM', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE');

CREATE TABLE "MonitoringAlertPolicy" (
  "id" UUID NOT NULL,
  "companyId" UUID,
  "branchId" UUID,
  "departmentId" UUID,
  "employeeId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "scope" "MonitoringAlertPolicyScope" NOT NULL,
  "settings" JSONB NOT NULL,
  "maintenanceStart" TIMESTAMP(3),
  "maintenanceEnd" TIMESTAMP(3),
  "maintenanceReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MonitoringAlertPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonitoringAlertPolicy_scope_enabled_idx" ON "MonitoringAlertPolicy"("scope", "enabled");
CREATE INDEX "MonitoringAlertPolicy_companyId_scope_priority_idx" ON "MonitoringAlertPolicy"("companyId", "scope", "priority");
CREATE INDEX "MonitoringAlertPolicy_branchId_priority_idx" ON "MonitoringAlertPolicy"("branchId", "priority");
CREATE INDEX "MonitoringAlertPolicy_departmentId_priority_idx" ON "MonitoringAlertPolicy"("departmentId", "priority");
CREATE INDEX "MonitoringAlertPolicy_employeeId_priority_idx" ON "MonitoringAlertPolicy"("employeeId", "priority");
CREATE INDEX "MonitoringAlertPolicy_deletedAt_idx" ON "MonitoringAlertPolicy"("deletedAt");

ALTER TABLE "MonitoringAlertPolicy" ADD CONSTRAINT "MonitoringAlertPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertPolicy" ADD CONSTRAINT "MonitoringAlertPolicy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertPolicy" ADD CONSTRAINT "MonitoringAlertPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertPolicy" ADD CONSTRAINT "MonitoringAlertPolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
