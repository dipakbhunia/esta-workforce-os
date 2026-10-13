BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preconditions$
DECLARE
  renewal_index_oid OID;
  renewal_index_columns TEXT[];
BEGIN
  IF to_regclass('public."Payment"') IS NULL OR
     to_regclass('public."SubscriptionRenewal"') IS NULL THEN
    RAISE EXCEPTION 'Renewal integrity convergence requires Payment and SubscriptionRenewal';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Payment" payment
    WHERE payment."purpose"::text = 'SUBSCRIPTION_RENEWAL'
      AND NOT EXISTS (
        SELECT 1 FROM "SubscriptionRenewal" renewal
        WHERE renewal."paymentId" = payment."id"
      )
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence blocked by unmatched renewal Payment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "SubscriptionRenewal" renewal
    LEFT JOIN "Payment" payment ON payment."id" = renewal."paymentId"
    LEFT JOIN "CompanySubscription" subscription ON subscription."id" = renewal."subscriptionId"
    LEFT JOIN "Company" company ON company."id" = renewal."companyId"
    WHERE payment."id" IS NULL OR subscription."id" IS NULL OR company."id" IS NULL OR
      payment."purpose"::text <> 'SUBSCRIPTION_RENEWAL' OR
      payment."companyId" IS DISTINCT FROM renewal."companyId" OR
      payment."subscriptionId" IS DISTINCT FROM renewal."subscriptionId" OR
      subscription."companyId" IS DISTINCT FROM renewal."companyId"
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence blocked by broken purpose or ownership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "SubscriptionRenewal"
    GROUP BY "paymentId", "subscriptionId", "companyId"
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "SubscriptionRenewal"
    GROUP BY "subscriptionId", "cycleStart"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence blocked by duplicate renewal tuples';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "SubscriptionRenewal"
    WHERE "cycleStart" >= "cycleEnd" OR
      "billingInterval"::text NOT IN ('MONTHLY', 'YEARLY') OR
      "seatQuantity" <= 0 OR
      "recurringTotalPriceMinor" <= 0 OR
      "recurringTotalPriceMinor" > 9007199254740991 OR
      ("recurringUnitPriceMinor" IS NOT NULL AND
        ("recurringUnitPriceMinor" <= 0 OR "recurringUnitPriceMinor" > 9007199254740991)) OR
      "currency" <> 'INR' OR
      NOT (
        ("recurringPriceBasis"::text = 'PER_USER_UNIT' AND
          "recurringUnitPriceMinor" IS NOT NULL AND
          "recurringUnitPriceMinor"::numeric * "seatQuantity"::numeric = "recurringTotalPriceMinor"::numeric) OR
        ("recurringPriceBasis"::text = 'FIXED_TOTAL' AND "recurringUnitPriceMinor" IS NULL)
      ) OR
      "applicationAttemptCount" < 0 OR
      NOT (
        ("status"::text = 'PREPARED' AND "appliedAt" IS NULL AND "blockedAt" IS NULL AND
          "blockCode" IS NULL AND "safeBlockMessage" IS NULL) OR
        ("status"::text = 'APPLIED' AND "appliedAt" IS NOT NULL AND "blockedAt" IS NULL AND
          "blockCode" IS NULL AND "safeBlockMessage" IS NULL) OR
        ("status"::text = 'BLOCKED' AND "appliedAt" IS NULL AND "blockedAt" IS NOT NULL AND
          "blockCode" IS NOT NULL AND BTRIM("blockCode") <> '')
      )
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence blocked by invalid lifecycle or financial evidence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE "conname" = 'SubscriptionRenewal_paymentId_subscriptionId_companyId_fkey'
      AND "conrelid" = '"SubscriptionRenewal"'::regclass
      AND "confrelid" = '"Payment"'::regclass
      AND "contype" = 'f' AND "convalidated"
      AND pg_get_constraintdef("oid") LIKE
        'FOREIGN KEY ("paymentId", "subscriptionId", "companyId") REFERENCES "Payment"(id, "subscriptionId", "companyId")%ON UPDATE CASCADE ON DELETE RESTRICT%'
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence requires the validated composite Payment foreign key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE "tgname" = 'Payment_renewal_link_check'
      AND "tgrelid" = '"Payment"'::regclass
      AND "tgenabled" = 'O' AND "tgconstraint" <> 0
      AND "tgdeferrable" AND "tginitdeferred"
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE "tgname" = 'SubscriptionRenewal_payment_purpose_check'
      AND "tgrelid" = '"SubscriptionRenewal"'::regclass
      AND "tgenabled" = 'O' AND "tgconstraint" <> 0
      AND "tgdeferrable" AND "tginitdeferred"
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE "tgname" = 'SubscriptionRenewal_immutability'
      AND "tgrelid" = '"SubscriptionRenewal"'::regclass
      AND "tgenabled" = 'O'
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence requires enabled renewal triggers';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "_prisma_migrations"
    WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
      AND "migration_name" <> '20261020120000_subscription_renewal_integrity_convergence'
  ) OR EXISTS (
    SELECT 1 FROM "_prisma_migrations" WHERE "rolled_back_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence blocked by incomplete or rolled-back migration history';
  END IF;

  renewal_index_oid := to_regclass('public."SubscriptionRenewal_id_subscriptionId_companyId_key"');
  IF renewal_index_oid IS NOT NULL THEN
    SELECT ARRAY_AGG(attribute."attname" ORDER BY key_column."ordinality")
    INTO renewal_index_columns
    FROM pg_index index_definition
    CROSS JOIN LATERAL UNNEST(index_definition."indkey") WITH ORDINALITY AS key_column("attnum", "ordinality")
    JOIN pg_attribute attribute ON attribute."attrelid" = index_definition."indrelid"
      AND attribute."attnum" = key_column."attnum"
    WHERE index_definition."indexrelid" = renewal_index_oid
      AND index_definition."indrelid" = '"SubscriptionRenewal"'::regclass
      AND index_definition."indisunique" AND index_definition."indisvalid" AND index_definition."indisready"
      AND index_definition."indnkeyatts" = 3;

    IF renewal_index_columns IS DISTINCT FROM ARRAY['id', 'subscriptionId', 'companyId']::TEXT[] THEN
      RAISE EXCEPTION 'Renewal integrity convergence found an unexpected historical index definition';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE "conindid" = renewal_index_oid) OR
       EXISTS (
         SELECT 1 FROM pg_depend
         WHERE "objid" = renewal_index_oid AND "deptype" <> 'a'
       ) THEN
      RAISE EXCEPTION 'Renewal integrity convergence found an unexpected historical index dependency';
    END IF;
  END IF;
END
$preconditions$;

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

ALTER TABLE "SubscriptionRenewal"
  ALTER CONSTRAINT "SubscriptionRenewal_paymentId_subscriptionId_companyId_fkey"
  DEFERRABLE INITIALLY DEFERRED;

DROP INDEX IF EXISTS "SubscriptionRenewal_id_subscriptionId_companyId_key";

DO $postconditions$
DECLARE
  renewal_function_source TEXT;
BEGIN
  SELECT "prosrc" INTO renewal_function_source
  FROM pg_proc
  WHERE "oid" = 'validate_renewal_payment_link()'::regprocedure;

  IF renewal_function_source NOT LIKE '%current_purpose%' OR
     renewal_function_source NOT LIKE '%has_renewal%' OR
     renewal_function_source NOT LIKE '%current_purpose <> ''SUBSCRIPTION_RENEWAL''%' THEN
    RAISE EXCEPTION 'Renewal integrity convergence did not install the hardened function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE "conname" = 'SubscriptionRenewal_paymentId_subscriptionId_companyId_fkey'
      AND "conrelid" = '"SubscriptionRenewal"'::regclass
      AND "contype" = 'f' AND "convalidated" AND "condeferrable" AND "condeferred"
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence did not defer the composite foreign key';
  END IF;

  IF to_regclass('public."SubscriptionRenewal_id_subscriptionId_companyId_key"') IS NOT NULL THEN
    RAISE EXCEPTION 'Renewal integrity convergence did not remove the historical index';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Payment" payment
    WHERE payment."purpose"::text = 'SUBSCRIPTION_RENEWAL'
      AND NOT EXISTS (SELECT 1 FROM "SubscriptionRenewal" renewal WHERE renewal."paymentId" = payment."id")
  ) OR EXISTS (
    SELECT 1 FROM "SubscriptionRenewal" renewal
    JOIN "Payment" payment ON payment."id" = renewal."paymentId"
    WHERE payment."purpose"::text <> 'SUBSCRIPTION_RENEWAL' OR
      payment."companyId" IS DISTINCT FROM renewal."companyId" OR
      payment."subscriptionId" IS DISTINCT FROM renewal."subscriptionId"
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence postcondition found invalid renewal linkage';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE "tgname" = 'Payment_renewal_link_check'
      AND "tgrelid" = '"Payment"'::regclass
      AND "tgenabled" = 'O' AND "tgdeferrable" AND "tginitdeferred"
  ) THEN
    RAISE EXCEPTION 'Renewal integrity convergence changed the payment trigger attachment';
  END IF;
END
$postconditions$;

COMMIT;
