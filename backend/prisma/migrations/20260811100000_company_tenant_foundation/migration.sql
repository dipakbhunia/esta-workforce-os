-- Extend the tenant profile without changing existing company records.
ALTER TABLE "Company"
ADD COLUMN "primaryEmail" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN "currency" TEXT,
ADD COLUMN "address" TEXT;
