CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'SUPERSEDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY', 'CUSTOM');
CREATE TYPE "SubscriptionActivationSource" AS ENUM ('MANUAL', 'PAYMENT', 'TRIAL_CONVERSION', 'COMPLIMENTARY');

CREATE TABLE "CompanySubscription" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "activationSource" "SubscriptionActivationSource" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "planCodeSnapshot" TEXT NOT NULL,
    "planNameSnapshot" TEXT NOT NULL,
    "billingModelSnapshot" "PlanBillingModel" NOT NULL,
    "currency" TEXT NOT NULL,
    "pricePerSeatMinor" INTEGER,
    "customRecurringPriceMinor" INTEGER,
    "seatQuantity" INTEGER NOT NULL,
    "entitlementsSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "limitsSnapshot" JSONB NOT NULL DEFAULT '{}',
    "startsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "supersedesSubscriptionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanySubscription_seatQuantity_check" CHECK ("seatQuantity" >= 1),
    CONSTRAINT "CompanySubscription_pricePerSeatMinor_check" CHECK ("pricePerSeatMinor" IS NULL OR "pricePerSeatMinor" >= 0),
    CONSTRAINT "CompanySubscription_customRecurringPriceMinor_check" CHECK ("customRecurringPriceMinor" IS NULL OR "customRecurringPriceMinor" >= 0),
    CONSTRAINT "CompanySubscription_period_pair_check" CHECK (("currentPeriodStart" IS NULL) = ("currentPeriodEnd" IS NULL)),
    CONSTRAINT "CompanySubscription_period_order_check" CHECK ("currentPeriodStart" IS NULL OR "currentPeriodStart" < "currentPeriodEnd")
);

CREATE INDEX "CompanySubscription_companyId_status_idx" ON "CompanySubscription"("companyId", "status");
CREATE INDEX "CompanySubscription_planId_status_idx" ON "CompanySubscription"("planId", "status");
CREATE INDEX "CompanySubscription_status_currentPeriodEnd_idx" ON "CompanySubscription"("status", "currentPeriodEnd");
CREATE INDEX "CompanySubscription_createdAt_idx" ON "CompanySubscription"("createdAt");
CREATE INDEX "CompanySubscription_supersedesSubscriptionId_idx" ON "CompanySubscription"("supersedesSubscriptionId");
CREATE UNIQUE INDEX "CompanySubscription_one_live_per_company_idx" ON "CompanySubscription"("companyId") WHERE "status" IN ('ACTIVE', 'SUSPENDED');

ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_supersedesSubscriptionId_fkey" FOREIGN KEY ("supersedesSubscriptionId") REFERENCES "CompanySubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
