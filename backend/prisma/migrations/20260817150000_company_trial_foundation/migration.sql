CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'CONVERTED');

CREATE TABLE "CompanyTrial" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "seatLimit" INTEGER NOT NULL,
    "entitlementsSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "limitsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedSubscriptionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyTrial_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyTrial_seatLimit_check" CHECK ("seatLimit" >= 1),
    CONSTRAINT "CompanyTrial_window_check" CHECK ("startsAt" < "endsAt"),
    CONSTRAINT "CompanyTrial_lifecycle_check" CHECK (
        ("status" = 'ACTIVE' AND "cancelledAt" IS NULL AND "expiredAt" IS NULL AND "convertedAt" IS NULL AND "convertedSubscriptionId" IS NULL)
        OR ("status" = 'EXPIRED' AND "cancelledAt" IS NULL AND "expiredAt" IS NOT NULL AND "convertedAt" IS NULL AND "convertedSubscriptionId" IS NULL)
        OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "expiredAt" IS NULL AND "convertedAt" IS NULL AND "convertedSubscriptionId" IS NULL)
        OR ("status" = 'CONVERTED' AND "cancelledAt" IS NULL AND "expiredAt" IS NULL AND "convertedAt" IS NOT NULL AND "convertedSubscriptionId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "CompanyTrial_convertedSubscriptionId_key" ON "CompanyTrial"("convertedSubscriptionId");
CREATE INDEX "CompanyTrial_companyId_status_idx" ON "CompanyTrial"("companyId", "status");
CREATE INDEX "CompanyTrial_status_endsAt_idx" ON "CompanyTrial"("status", "endsAt");
CREATE INDEX "CompanyTrial_createdAt_idx" ON "CompanyTrial"("createdAt");
CREATE UNIQUE INDEX "CompanyTrial_one_active_per_company_idx" ON "CompanyTrial"("companyId") WHERE "status" = 'ACTIVE';

ALTER TABLE "CompanyTrial" ADD CONSTRAINT "CompanyTrial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyTrial" ADD CONSTRAINT "CompanyTrial_convertedSubscriptionId_fkey" FOREIGN KEY ("convertedSubscriptionId") REFERENCES "CompanySubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
