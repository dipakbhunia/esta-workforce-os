ALTER TYPE "PaymentPurpose" ADD VALUE 'SUBSCRIPTION_RENEWAL';

CREATE TYPE "SubscriptionRenewalStatus" AS ENUM ('PREPARED', 'APPLIED', 'BLOCKED');

CREATE TABLE "SubscriptionRenewal" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "cycleStart" TIMESTAMP(3) NOT NULL,
  "cycleEnd" TIMESTAMP(3) NOT NULL,
  "billingInterval" "BillingInterval" NOT NULL,
  "recurringPriceBasis" "RecurringPriceBasis" NOT NULL,
  "recurringUnitPriceMinor" BIGINT,
  "recurringTotalPriceMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "seatQuantity" INTEGER NOT NULL,
  "status" "SubscriptionRenewalStatus" NOT NULL DEFAULT 'PREPARED',
  "preparedByUserId" UUID,
  "applicationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastApplicationAttemptAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "blockCode" TEXT,
  "safeBlockMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubscriptionRenewal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionRenewal_cycle_check" CHECK ("cycleStart" < "cycleEnd"),
  CONSTRAINT "SubscriptionRenewal_interval_check" CHECK ("billingInterval" IN ('MONTHLY', 'YEARLY')),
  CONSTRAINT "SubscriptionRenewal_seat_quantity_check" CHECK ("seatQuantity" > 0),
  CONSTRAINT "SubscriptionRenewal_money_check" CHECK (
    "recurringTotalPriceMinor" > 0 AND "recurringTotalPriceMinor" <= 9007199254740991 AND
    ("recurringUnitPriceMinor" IS NULL OR ("recurringUnitPriceMinor" > 0 AND "recurringUnitPriceMinor" <= 9007199254740991))
  ),
  CONSTRAINT "SubscriptionRenewal_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "SubscriptionRenewal_pricing_basis_check" CHECK (
    ("recurringPriceBasis" = 'PER_USER_UNIT' AND "recurringUnitPriceMinor" IS NOT NULL AND
      "recurringUnitPriceMinor"::numeric * "seatQuantity"::numeric = "recurringTotalPriceMinor"::numeric) OR
    ("recurringPriceBasis" = 'FIXED_TOTAL' AND "recurringUnitPriceMinor" IS NULL)
  ),
  CONSTRAINT "SubscriptionRenewal_attempt_count_check" CHECK ("applicationAttemptCount" >= 0),
  CONSTRAINT "SubscriptionRenewal_status_timestamps_check" CHECK (
    ("status" = 'PREPARED' AND "appliedAt" IS NULL AND "blockedAt" IS NULL AND "blockCode" IS NULL AND "safeBlockMessage" IS NULL) OR
    ("status" = 'APPLIED' AND "appliedAt" IS NOT NULL AND "blockedAt" IS NULL AND "blockCode" IS NULL AND "safeBlockMessage" IS NULL) OR
    ("status" = 'BLOCKED' AND "appliedAt" IS NULL AND "blockedAt" IS NOT NULL AND "blockCode" IS NOT NULL AND BTRIM("blockCode") <> '')
  )
);

CREATE UNIQUE INDEX "SubscriptionRenewal_paymentId_key" ON "SubscriptionRenewal"("paymentId");
CREATE UNIQUE INDEX "SubscriptionRenewal_subscriptionId_cycleStart_key" ON "SubscriptionRenewal"("subscriptionId", "cycleStart");
CREATE UNIQUE INDEX "SubscriptionRenewal_paymentId_subscriptionId_companyId_key" ON "SubscriptionRenewal"("paymentId", "subscriptionId", "companyId");
CREATE INDEX "SubscriptionRenewal_recovery_order_idx" ON "SubscriptionRenewal"("status", "cycleStart", "id");
CREATE INDEX "SubscriptionRenewal_company_history_idx" ON "SubscriptionRenewal"("companyId", "createdAt", "id");
CREATE INDEX "SubscriptionRenewal_preparedByUserId_idx" ON "SubscriptionRenewal"("preparedByUserId");
CREATE INDEX "CompanySubscription_renewal_candidates_idx" ON "CompanySubscription"("status", "currentPeriodEnd", "id");

ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_subscriptionId_companyId_fkey"
  FOREIGN KEY ("subscriptionId", "companyId") REFERENCES "CompanySubscription"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_paymentId_subscriptionId_companyId_fkey"
  FOREIGN KEY ("paymentId", "subscriptionId", "companyId") REFERENCES "Payment"("id", "subscriptionId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_preparedByUserId_fkey"
  FOREIGN KEY ("preparedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "validate_subscription_renewal_payment"() RETURNS trigger AS $$
DECLARE linked_payment "Payment"%ROWTYPE;
BEGIN
  SELECT * INTO linked_payment FROM "Payment" WHERE "id" = NEW."paymentId";
  IF NOT FOUND OR linked_payment."purpose"::text <> 'SUBSCRIPTION_RENEWAL' OR
     linked_payment."companyId" <> NEW."companyId" OR linked_payment."subscriptionId" <> NEW."subscriptionId" THEN
    RAISE EXCEPTION 'Subscription renewal Payment purpose or ownership is invalid';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "SubscriptionRenewal_payment_purpose_check"
AFTER INSERT OR UPDATE ON "SubscriptionRenewal"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "validate_subscription_renewal_payment"();

CREATE OR REPLACE FUNCTION "validate_renewal_payment_link"() RETURNS trigger AS $$
DECLARE current_purpose TEXT;
DECLARE has_renewal BOOLEAN;
BEGIN
  SELECT payment."purpose"::text INTO current_purpose
  FROM "Payment" payment WHERE payment."id" = NEW."id";
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM "SubscriptionRenewal" renewal WHERE renewal."paymentId" = NEW."id"
  ) INTO has_renewal;

  IF current_purpose = 'SUBSCRIPTION_RENEWAL' AND NOT has_renewal THEN
    RAISE EXCEPTION 'Renewal Payment must be linked to its SubscriptionRenewal';
  END IF;
  IF current_purpose <> 'SUBSCRIPTION_RENEWAL' AND has_renewal THEN
    RAISE EXCEPTION 'Payment linked to a SubscriptionRenewal must retain renewal purpose';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Payment_renewal_link_check"
AFTER INSERT OR UPDATE OF "purpose", "subscriptionId", "companyId" ON "Payment"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "validate_renewal_payment_link"();

CREATE OR REPLACE FUNCTION "protect_subscription_renewal_evidence"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Subscription renewal evidence is immutable';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" OR
     NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId" OR
     NEW."paymentId" IS DISTINCT FROM OLD."paymentId" OR
     NEW."cycleStart" IS DISTINCT FROM OLD."cycleStart" OR
     NEW."cycleEnd" IS DISTINCT FROM OLD."cycleEnd" OR
     NEW."billingInterval" IS DISTINCT FROM OLD."billingInterval" OR
     NEW."recurringPriceBasis" IS DISTINCT FROM OLD."recurringPriceBasis" OR
     NEW."recurringUnitPriceMinor" IS DISTINCT FROM OLD."recurringUnitPriceMinor" OR
     NEW."recurringTotalPriceMinor" IS DISTINCT FROM OLD."recurringTotalPriceMinor" OR
     NEW."currency" IS DISTINCT FROM OLD."currency" OR
     NEW."seatQuantity" IS DISTINCT FROM OLD."seatQuantity" THEN
    RAISE EXCEPTION 'Subscription renewal cycle and commercial evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SubscriptionRenewal_immutability"
BEFORE UPDATE OR DELETE ON "SubscriptionRenewal"
FOR EACH ROW EXECUTE FUNCTION "protect_subscription_renewal_evidence"();
