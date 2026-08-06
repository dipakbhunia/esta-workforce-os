CREATE TYPE "ShiftRosterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED', 'CANCELLED');
CREATE TYPE "RosterDayType" AS ENUM ('WORKING', 'WEEKLY_OFF', 'HOLIDAY', 'LEAVE', 'NO_SHIFT');
CREATE TYPE "RosterDaySource" AS ENUM ('MANUAL', 'SHIFT_ASSIGNMENT', 'TEMPLATE', 'ROTATION', 'WEEKLY_OFF_RULE', 'HOLIDAY_CALENDAR', 'SYSTEM', 'IMPORT', 'MANUAL_OVERRIDE');
CREATE TYPE "WeeklyOffRuleType" AS ENUM ('FIXED_WEEKDAYS');
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'REGIONAL', 'COMPANY', 'OPTIONAL', 'CUSTOM');

CREATE TABLE "ShiftRosterPeriod" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID,
  "departmentId" UUID,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "dateFrom" DATE NOT NULL,
  "dateTo" DATE NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "status" "ShiftRosterStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "publishedById" UUID,
  "lockedAt" TIMESTAMP(3),
  "lockedById" UUID,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ShiftRosterPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftRosterDay" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "rosterPeriodId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "workDate" DATE NOT NULL,
  "dayType" "RosterDayType" NOT NULL,
  "shiftId" UUID,
  "source" "RosterDaySource" NOT NULL DEFAULT 'MANUAL',
  "shiftName" TEXT,
  "shiftCode" TEXT,
  "shiftStartTime" TEXT,
  "shiftEndTime" TEXT,
  "shiftTimezone" TEXT,
  "scheduledStartAt" TIMESTAMP(3),
  "scheduledEndAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ShiftRosterDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyOffRule" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID,
  "departmentId" UUID,
  "employeeId" UUID,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "ruleType" "WeeklyOffRuleType" NOT NULL DEFAULT 'FIXED_WEEKDAYS',
  "weekdays" JSONB NOT NULL,
  "alternateWeekPattern" JSONB,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "WeeklyOffRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HolidayCalendar" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID,
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Holiday" (
  "id" UUID NOT NULL,
  "calendarId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "type" "HolidayType" NOT NULL DEFAULT 'COMPANY',
  "optional" BOOLEAN NOT NULL DEFAULT false,
  "recurring" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Attendance"
  ADD COLUMN "rosterPeriodId" UUID,
  ADD COLUMN "rosterDayId" UUID,
  ADD COLUMN "rosterSource" "RosterDaySource",
  ADD COLUMN "dayType" "RosterDayType",
  ADD COLUMN "isWeeklyOff" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weeklyOffRuleId" UUID,
  ADD COLUMN "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holidayId" UUID,
  ADD COLUMN "holidayName" TEXT;

CREATE UNIQUE INDEX "ShiftRosterDay_companyId_employeeId_workDate_rosterPeriodId_key" ON "ShiftRosterDay"("companyId", "employeeId", "workDate", "rosterPeriodId");
CREATE UNIQUE INDEX "Holiday_calendarId_date_name_key" ON "Holiday"("calendarId", "date", "name");

CREATE INDEX "ShiftRosterPeriod_companyId_dateFrom_dateTo_idx" ON "ShiftRosterPeriod"("companyId", "dateFrom", "dateTo");
CREATE INDEX "ShiftRosterPeriod_companyId_status_idx" ON "ShiftRosterPeriod"("companyId", "status");
CREATE INDEX "ShiftRosterPeriod_branchId_dateFrom_dateTo_idx" ON "ShiftRosterPeriod"("branchId", "dateFrom", "dateTo");
CREATE INDEX "ShiftRosterPeriod_departmentId_dateFrom_dateTo_idx" ON "ShiftRosterPeriod"("departmentId", "dateFrom", "dateTo");
CREATE INDEX "ShiftRosterPeriod_deletedAt_idx" ON "ShiftRosterPeriod"("deletedAt");
CREATE INDEX "ShiftRosterDay_companyId_workDate_idx" ON "ShiftRosterDay"("companyId", "workDate");
CREATE INDEX "ShiftRosterDay_employeeId_workDate_idx" ON "ShiftRosterDay"("employeeId", "workDate");
CREATE INDEX "ShiftRosterDay_rosterPeriodId_idx" ON "ShiftRosterDay"("rosterPeriodId");
CREATE INDEX "ShiftRosterDay_shiftId_idx" ON "ShiftRosterDay"("shiftId");
CREATE INDEX "ShiftRosterDay_dayType_idx" ON "ShiftRosterDay"("dayType");
CREATE INDEX "ShiftRosterDay_source_idx" ON "ShiftRosterDay"("source");
CREATE INDEX "ShiftRosterDay_deletedAt_idx" ON "ShiftRosterDay"("deletedAt");
CREATE INDEX "WeeklyOffRule_companyId_enabled_priority_idx" ON "WeeklyOffRule"("companyId", "enabled", "priority");
CREATE INDEX "WeeklyOffRule_employeeId_effectiveFrom_effectiveTo_idx" ON "WeeklyOffRule"("employeeId", "effectiveFrom", "effectiveTo");
CREATE INDEX "WeeklyOffRule_departmentId_effectiveFrom_effectiveTo_idx" ON "WeeklyOffRule"("departmentId", "effectiveFrom", "effectiveTo");
CREATE INDEX "WeeklyOffRule_branchId_effectiveFrom_effectiveTo_idx" ON "WeeklyOffRule"("branchId", "effectiveFrom", "effectiveTo");
CREATE INDEX "WeeklyOffRule_deletedAt_idx" ON "WeeklyOffRule"("deletedAt");
CREATE INDEX "HolidayCalendar_companyId_enabled_idx" ON "HolidayCalendar"("companyId", "enabled");
CREATE INDEX "HolidayCalendar_branchId_enabled_idx" ON "HolidayCalendar"("branchId", "enabled");
CREATE INDEX "HolidayCalendar_deletedAt_idx" ON "HolidayCalendar"("deletedAt");
CREATE INDEX "Holiday_companyId_date_idx" ON "Holiday"("companyId", "date");
CREATE INDEX "Holiday_calendarId_date_idx" ON "Holiday"("calendarId", "date");
CREATE INDEX "Holiday_deletedAt_idx" ON "Holiday"("deletedAt");
CREATE INDEX "Attendance_rosterPeriodId_idx" ON "Attendance"("rosterPeriodId");
CREATE INDEX "Attendance_rosterDayId_idx" ON "Attendance"("rosterDayId");
CREATE INDEX "Attendance_weeklyOffRuleId_idx" ON "Attendance"("weeklyOffRuleId");
CREATE INDEX "Attendance_holidayId_idx" ON "Attendance"("holidayId");
CREATE INDEX "Attendance_dayType_idx" ON "Attendance"("dayType");

ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterPeriod" ADD CONSTRAINT "ShiftRosterPeriod_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_rosterPeriodId_fkey" FOREIGN KEY ("rosterPeriodId") REFERENCES "ShiftRosterPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRosterDay" ADD CONSTRAINT "ShiftRosterDay_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyOffRule" ADD CONSTRAINT "WeeklyOffRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HolidayCalendar" ADD CONSTRAINT "HolidayCalendar_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "HolidayCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_rosterPeriodId_fkey" FOREIGN KEY ("rosterPeriodId") REFERENCES "ShiftRosterPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_rosterDayId_fkey" FOREIGN KEY ("rosterDayId") REFERENCES "ShiftRosterDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_weeklyOffRuleId_fkey" FOREIGN KEY ("weeklyOffRuleId") REFERENCES "WeeklyOffRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE SET NULL ON UPDATE CASCADE;
