CREATE TABLE "RotationPattern" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "departmentId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "cycleLengthDays" INTEGER NOT NULL,
    "anchorDate" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RotationPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RotationPatternDay" (
    "id" UUID NOT NULL,
    "patternId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dayType" "RosterDayType" NOT NULL,
    "shiftId" UUID,
    "shiftName" TEXT,
    "shiftCode" TEXT,
    "shiftStartTime" TEXT,
    "shiftEndTime" TEXT,
    "shiftTimezone" TEXT,
    "label" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RotationPatternDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RotationPattern_companyId_enabled_idx" ON "RotationPattern"("companyId", "enabled");
CREATE INDEX "RotationPattern_branchId_enabled_idx" ON "RotationPattern"("branchId", "enabled");
CREATE INDEX "RotationPattern_departmentId_enabled_idx" ON "RotationPattern"("departmentId", "enabled");
CREATE INDEX "RotationPattern_cycleLengthDays_idx" ON "RotationPattern"("cycleLengthDays");
CREATE INDEX "RotationPattern_anchorDate_idx" ON "RotationPattern"("anchorDate");
CREATE INDEX "RotationPattern_deletedAt_idx" ON "RotationPattern"("deletedAt");
CREATE UNIQUE INDEX "RotationPattern_companyId_code_active_key" ON "RotationPattern"("companyId", "code") WHERE "deletedAt" IS NULL;

CREATE INDEX "RotationPatternDay_companyId_sequence_idx" ON "RotationPatternDay"("companyId", "sequence");
CREATE INDEX "RotationPatternDay_patternId_sequence_idx" ON "RotationPatternDay"("patternId", "sequence");
CREATE INDEX "RotationPatternDay_shiftId_idx" ON "RotationPatternDay"("shiftId");
CREATE INDEX "RotationPatternDay_dayType_idx" ON "RotationPatternDay"("dayType");
CREATE INDEX "RotationPatternDay_deletedAt_idx" ON "RotationPatternDay"("deletedAt");
CREATE UNIQUE INDEX "RotationPatternDay_patternId_sequence_active_key" ON "RotationPatternDay"("patternId", "sequence") WHERE "deletedAt" IS NULL;

ALTER TABLE "RotationPattern" ADD CONSTRAINT "RotationPattern_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RotationPattern" ADD CONSTRAINT "RotationPattern_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPattern" ADD CONSTRAINT "RotationPattern_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPattern" ADD CONSTRAINT "RotationPattern_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPattern" ADD CONSTRAINT "RotationPattern_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPatternDay" ADD CONSTRAINT "RotationPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "RotationPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RotationPatternDay" ADD CONSTRAINT "RotationPatternDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RotationPatternDay" ADD CONSTRAINT "RotationPatternDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPatternDay" ADD CONSTRAINT "RotationPatternDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RotationPatternDay" ADD CONSTRAINT "RotationPatternDay_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;