CREATE TYPE "RecurringPriceBasis" AS ENUM ('PER_USER_UNIT', 'FIXED_TOTAL');

CREATE TABLE "PlanRecurringPrice" (
  "id" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "billingInterval" "BillingInterval" NOT NULL,
  "basis" "RecurringPriceBasis" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanRecurringPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanRecurringPrice_supported_interval_check" CHECK ("billingInterval" IN ('MONTHLY', 'YEARLY')),
  CONSTRAINT "PlanRecurringPrice_amount_check" CHECK ("amountMinor" >= 0 AND "amountMinor" <= 9007199254740991),
  CONSTRAINT "PlanRecurringPrice_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

ALTER TABLE "CompanySubscription"
ADD COLUMN "recurringPriceBasis" "RecurringPriceBasis",
ADD COLUMN "recurringUnitPriceMinor" BIGINT,
ADD COLUMN "recurringTotalPriceMinor" BIGINT,
ADD COLUMN "recurringCurrency" TEXT,
ADD COLUMN "pricingInterval" "BillingInterval",
ADD COLUMN "pricingResolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PlanRecurringPrice_planId_billingInterval_key"
ON "PlanRecurringPrice"("planId", "billingInterval");

CREATE INDEX "PlanRecurringPrice_billingInterval_idx"
ON "PlanRecurringPrice"("billingInterval");

ALTER TABLE "PlanRecurringPrice"
ADD CONSTRAINT "PlanRecurringPrice_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanySubscription"
ADD CONSTRAINT "CompanySubscription_recurring_pricing_check"
CHECK (
  (
    "recurringPriceBasis" IS NULL
    AND "recurringUnitPriceMinor" IS NULL
    AND "recurringTotalPriceMinor" IS NULL
    AND "recurringCurrency" IS NULL
    AND "pricingInterval" IS NULL
    AND "pricingResolvedAt" IS NULL
  )
  OR (
    "recurringPriceBasis" IS NOT NULL
    AND "recurringTotalPriceMinor" IS NOT NULL
    AND "recurringTotalPriceMinor" >= 0
    AND "recurringTotalPriceMinor" <= 9007199254740991
    AND "recurringCurrency" ~ '^[A-Z]{3}$'
    AND "pricingInterval" IN ('MONTHLY', 'YEARLY')
    AND "pricingResolvedAt" IS NOT NULL
    AND (
      ("recurringPriceBasis" = 'PER_USER_UNIT' AND "recurringUnitPriceMinor" IS NOT NULL AND "recurringUnitPriceMinor" >= 0 AND "recurringUnitPriceMinor" <= 9007199254740991)
      OR ("recurringPriceBasis" = 'FIXED_TOTAL' AND "recurringUnitPriceMinor" IS NULL)
    )
  )
);

INSERT INTO "PlanRecurringPrice" (
  "id", "planId", "billingInterval", "basis", "amountMinor", "currency", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), "id", 'MONTHLY', 'PER_USER_UNIT', "monthlyPricePerSeatMinor"::BIGINT, "currency", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Plan"
WHERE "billingModel" = 'PER_USER'
  AND "monthlyPricePerSeatMinor" IS NOT NULL
  AND "monthlyPricePerSeatMinor" >= 0
  AND "currency" ~ '^[A-Z]{3}$';

UPDATE "CompanySubscription"
SET
  "recurringPriceBasis" = 'PER_USER_UNIT',
  "recurringUnitPriceMinor" = "pricePerSeatMinor"::BIGINT,
  "recurringTotalPriceMinor" = "pricePerSeatMinor"::BIGINT * "seatQuantity"::BIGINT,
  "recurringCurrency" = "currency",
  "pricingInterval" = 'MONTHLY',
  "pricingResolvedAt" = CURRENT_TIMESTAMP
WHERE "billingModelSnapshot" = 'PER_USER'
  AND "billingInterval" = 'MONTHLY'
  AND "pricePerSeatMinor" IS NOT NULL
  AND "pricePerSeatMinor" >= 0
  AND "seatQuantity" > 0
  AND "currency" ~ '^[A-Z]{3}$'
  AND "pricePerSeatMinor"::BIGINT <= 9007199254740991 / "seatQuantity"::BIGINT;
