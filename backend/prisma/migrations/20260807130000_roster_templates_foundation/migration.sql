CREATE TABLE "RosterTemplate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "departmentId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RosterTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RosterTemplateDay" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "dayType" "RosterDayType" NOT NULL,
    "shiftId" UUID,
    "shiftName" TEXT,
    "shiftCode" TEXT,
    "shiftStartTime" TEXT,
    "shiftEndTime" TEXT,
    "shiftTimezone" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RosterTemplateDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RosterTemplate_companyId_enabled_idx" ON "RosterTemplate"("companyId", "enabled");
CREATE INDEX "RosterTemplate_branchId_enabled_idx" ON "RosterTemplate"("branchId", "enabled");
CREATE INDEX "RosterTemplate_departmentId_enabled_idx" ON "RosterTemplate"("departmentId", "enabled");
CREATE INDEX "RosterTemplate_deletedAt_idx" ON "RosterTemplate"("deletedAt");
CREATE UNIQUE INDEX "RosterTemplate_companyId_code_active_key" ON "RosterTemplate"("companyId", "code") WHERE "deletedAt" IS NULL;

CREATE INDEX "RosterTemplateDay_companyId_dayOfWeek_idx" ON "RosterTemplateDay"("companyId", "dayOfWeek");
CREATE INDEX "RosterTemplateDay_templateId_sequence_idx" ON "RosterTemplateDay"("templateId", "sequence");
CREATE INDEX "RosterTemplateDay_shiftId_idx" ON "RosterTemplateDay"("shiftId");
CREATE INDEX "RosterTemplateDay_dayType_idx" ON "RosterTemplateDay"("dayType");
CREATE INDEX "RosterTemplateDay_deletedAt_idx" ON "RosterTemplateDay"("deletedAt");
CREATE UNIQUE INDEX "RosterTemplateDay_templateId_dayOfWeek_active_key" ON "RosterTemplateDay"("templateId", "dayOfWeek") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "RosterTemplateDay_templateId_sequence_active_key" ON "RosterTemplateDay"("templateId", "sequence") WHERE "deletedAt" IS NULL;

ALTER TABLE "RosterTemplate" ADD CONSTRAINT "RosterTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RosterTemplate" ADD CONSTRAINT "RosterTemplate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplate" ADD CONSTRAINT "RosterTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplate" ADD CONSTRAINT "RosterTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplate" ADD CONSTRAINT "RosterTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplateDay" ADD CONSTRAINT "RosterTemplateDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RosterTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RosterTemplateDay" ADD CONSTRAINT "RosterTemplateDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RosterTemplateDay" ADD CONSTRAINT "RosterTemplateDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplateDay" ADD CONSTRAINT "RosterTemplateDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RosterTemplateDay" ADD CONSTRAINT "RosterTemplateDay_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
