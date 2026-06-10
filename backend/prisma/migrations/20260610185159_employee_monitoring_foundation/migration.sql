-- CreateEnum
CREATE TYPE "MonitoringDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "MonitoringDevice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceIdentifier" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "status" "MonitoringDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Heartbeat" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleSeconds" INTEGER NOT NULL DEFAULT 0,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySession" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "idleSeconds" INTEGER NOT NULL DEFAULT 0,
    "keystrokeCount" INTEGER,
    "mouseClickCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screenshot" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "clientScreenshotId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationUsage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "activitySessionId" UUID NOT NULL,
    "applicationName" TEXT NOT NULL,
    "windowTitle" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteUsage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "activitySessionId" UUID NOT NULL,
    "browserName" TEXT,
    "domain" TEXT NOT NULL,
    "url" TEXT,
    "pageTitle" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoringDevice_companyId_status_idx" ON "MonitoringDevice"("companyId", "status");

-- CreateIndex
CREATE INDEX "MonitoringDevice_employeeId_status_idx" ON "MonitoringDevice"("employeeId", "status");

-- CreateIndex
CREATE INDEX "MonitoringDevice_lastSeenAt_idx" ON "MonitoringDevice"("lastSeenAt");

-- CreateIndex
CREATE INDEX "MonitoringDevice_deletedAt_idx" ON "MonitoringDevice"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringDevice_employeeId_deviceIdentifier_key" ON "MonitoringDevice"("employeeId", "deviceIdentifier");

-- CreateIndex
CREATE INDEX "Heartbeat_companyId_recordedAt_idx" ON "Heartbeat"("companyId", "recordedAt");

-- CreateIndex
CREATE INDEX "Heartbeat_employeeId_recordedAt_idx" ON "Heartbeat"("employeeId", "recordedAt");

-- CreateIndex
CREATE INDEX "Heartbeat_deviceId_recordedAt_idx" ON "Heartbeat"("deviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_companyId_startedAt_idx" ON "ActivitySession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_employeeId_startedAt_idx" ON "ActivitySession"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_deviceId_startedAt_idx" ON "ActivitySession"("deviceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySession_deviceId_clientSessionId_key" ON "ActivitySession"("deviceId", "clientSessionId");

-- CreateIndex
CREATE INDEX "Screenshot_companyId_capturedAt_idx" ON "Screenshot"("companyId", "capturedAt");

-- CreateIndex
CREATE INDEX "Screenshot_employeeId_capturedAt_idx" ON "Screenshot"("employeeId", "capturedAt");

-- CreateIndex
CREATE INDEX "Screenshot_deviceId_capturedAt_idx" ON "Screenshot"("deviceId", "capturedAt");

-- CreateIndex
CREATE INDEX "Screenshot_deletedAt_idx" ON "Screenshot"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Screenshot_deviceId_clientScreenshotId_key" ON "Screenshot"("deviceId", "clientScreenshotId");

-- CreateIndex
CREATE INDEX "ApplicationUsage_companyId_startedAt_idx" ON "ApplicationUsage"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationUsage_employeeId_startedAt_idx" ON "ApplicationUsage"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationUsage_deviceId_startedAt_idx" ON "ApplicationUsage"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationUsage_activitySessionId_idx" ON "ApplicationUsage"("activitySessionId");

-- CreateIndex
CREATE INDEX "ApplicationUsage_applicationName_idx" ON "ApplicationUsage"("applicationName");

-- CreateIndex
CREATE INDEX "WebsiteUsage_companyId_startedAt_idx" ON "WebsiteUsage"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "WebsiteUsage_employeeId_startedAt_idx" ON "WebsiteUsage"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "WebsiteUsage_deviceId_startedAt_idx" ON "WebsiteUsage"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "WebsiteUsage_activitySessionId_idx" ON "WebsiteUsage"("activitySessionId");

-- CreateIndex
CREATE INDEX "WebsiteUsage_domain_idx" ON "WebsiteUsage"("domain");

-- AddForeignKey
ALTER TABLE "MonitoringDevice" ADD CONSTRAINT "MonitoringDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringDevice" ADD CONSTRAINT "MonitoringDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Heartbeat" ADD CONSTRAINT "Heartbeat_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationUsage" ADD CONSTRAINT "ApplicationUsage_activitySessionId_fkey" FOREIGN KEY ("activitySessionId") REFERENCES "ActivitySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteUsage" ADD CONSTRAINT "WebsiteUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteUsage" ADD CONSTRAINT "WebsiteUsage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteUsage" ADD CONSTRAINT "WebsiteUsage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MonitoringDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteUsage" ADD CONSTRAINT "WebsiteUsage_activitySessionId_fkey" FOREIGN KEY ("activitySessionId") REFERENCES "ActivitySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
