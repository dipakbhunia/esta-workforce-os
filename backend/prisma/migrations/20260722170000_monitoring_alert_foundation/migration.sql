CREATE TYPE "MonitoringAlertType" AS ENUM ('DEVICE_OFFLINE', 'MISSING_HEARTBEAT', 'MONITORING_DISABLED', 'DEVICE_REVOKED', 'REREGISTRATION_REQUIRED', 'EXCESSIVE_IDLE', 'SCREENSHOT_MISSING');
CREATE TYPE "MonitoringAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "MonitoringAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "MonitoringAlertEventType" AS ENUM ('DETECTED', 'REDETECTED', 'ACKNOWLEDGED', 'RESOLVED', 'AUTO_RESOLVED', 'REOPENED');

CREATE TABLE "MonitoringAlert" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "employeeId" UUID,
  "deviceId" UUID,
  "type" "MonitoringAlertType" NOT NULL,
  "severity" "MonitoringAlertSeverity" NOT NULL,
  "status" "MonitoringAlertStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" UUID,
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" UUID,
  "resolutionNote" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonitoringAlertEvent" (
  "id" UUID NOT NULL,
  "alertId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "type" "MonitoringAlertEventType" NOT NULL,
  "actorUserId" UUID,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "metadata" JSONB,
  CONSTRAINT "MonitoringAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonitoringAlert_companyId_status_idx" ON "MonitoringAlert"("companyId", "status");
CREATE INDEX "MonitoringAlert_companyId_type_status_idx" ON "MonitoringAlert"("companyId", "type", "status");
CREATE INDEX "MonitoringAlert_employeeId_status_idx" ON "MonitoringAlert"("employeeId", "status");
CREATE INDEX "MonitoringAlert_deviceId_status_idx" ON "MonitoringAlert"("deviceId", "status");
CREATE INDEX "MonitoringAlert_deduplicationKey_idx" ON "MonitoringAlert"("deduplicationKey");
CREATE INDEX "MonitoringAlert_detectedAt_idx" ON "MonitoringAlert"("detectedAt");
CREATE INDEX "MonitoringAlert_lastDetectedAt_idx" ON "MonitoringAlert"("lastDetectedAt");
CREATE INDEX "MonitoringAlertEvent_alertId_occurredAt_idx" ON "MonitoringAlertEvent"("alertId", "occurredAt");
CREATE INDEX "MonitoringAlertEvent_companyId_occurredAt_idx" ON "MonitoringAlertEvent"("companyId", "occurredAt");
CREATE INDEX "MonitoringAlertEvent_type_idx" ON "MonitoringAlertEvent"("type");

ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertEvent" ADD CONSTRAINT "MonitoringAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "MonitoringAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertEvent" ADD CONSTRAINT "MonitoringAlertEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonitoringAlertEvent" ADD CONSTRAINT "MonitoringAlertEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
