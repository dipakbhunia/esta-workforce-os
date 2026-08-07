ALTER TABLE "HolidayCalendar"
  ADD COLUMN "year" INTEGER,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "notes" TEXT;

CREATE INDEX "HolidayCalendar_companyId_year_idx" ON "HolidayCalendar"("companyId", "year");
CREATE INDEX "HolidayCalendar_branchId_year_idx" ON "HolidayCalendar"("branchId", "year");