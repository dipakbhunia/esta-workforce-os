CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TYPE "PlanBillingModel" AS ENUM ('PER_USER', 'CUSTOM');

CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "billingModel" "PlanBillingModel" NOT NULL,
    "monthlyPricePerSeatMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "minSeats" INTEGER,
    "maxSeats" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "entitlements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "limits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_status_isPublic_sortOrder_idx" ON "Plan"("status", "isPublic", "sortOrder");
CREATE INDEX "Plan_billingModel_idx" ON "Plan"("billingModel");
CREATE INDEX "Plan_archivedAt_idx" ON "Plan"("archivedAt");
