-- DropIndex
DROP INDEX "Branch_companyId_code_key";

-- DropIndex
DROP INDEX "Company_slug_key";

-- DropIndex
DROP INDEX "Department_companyId_code_key";

-- DropIndex
DROP INDEX "Designation_companyId_code_key";

-- DropIndex
DROP INDEX "Shift_companyId_code_key";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Designation" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Branch_companyId_code_idx" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "Branch_deletedAt_idx" ON "Branch"("deletedAt");

-- CreateIndex
CREATE INDEX "Company_slug_idx" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_deletedAt_idx" ON "Company"("deletedAt");

-- CreateIndex
CREATE INDEX "Department_companyId_code_idx" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE INDEX "Designation_companyId_code_idx" ON "Designation"("companyId", "code");

-- CreateIndex
CREATE INDEX "Designation_deletedAt_idx" ON "Designation"("deletedAt");

-- CreateIndex
CREATE INDEX "Shift_companyId_code_idx" ON "Shift"("companyId", "code");

-- CreateIndex
CREATE INDEX "Shift_deletedAt_idx" ON "Shift"("deletedAt");

-- Enforce uniqueness only for active records so identifiers can be reused
-- after a soft delete.
CREATE UNIQUE INDEX "Company_active_slug_key"
ON "Company"("slug")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Branch_active_companyId_code_key"
ON "Branch"("companyId", "code")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Department_active_companyId_code_key"
ON "Department"("companyId", "code")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Designation_active_companyId_code_key"
ON "Designation"("companyId", "code")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "Shift_active_companyId_code_key"
ON "Shift"("companyId", "code")
WHERE "deletedAt" IS NULL;
