CREATE UNIQUE INDEX "PaymentAttempt_one_verified_checkout_per_payment_idx"
ON "PaymentAttempt" ("paymentId")
WHERE "operation" = 'CHECKOUT_CONFIRMATION' AND "status" = 'SUCCEEDED';

CREATE UNIQUE INDEX "PaymentAttempt_verified_provider_payment_identity_idx"
ON "PaymentAttempt" ("providerConfigurationId", "providerPaymentId")
WHERE
  "operation" = 'CHECKOUT_CONFIRMATION'
  AND "status" = 'SUCCEEDED'
  AND "providerConfigurationId" IS NOT NULL
  AND "providerPaymentId" IS NOT NULL;

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_checkout_confirmation_evidence_check"
CHECK (
  "operation" <> 'CHECKOUT_CONFIRMATION'
  OR (
    "providerConfigurationId" IS NOT NULL
    AND "credentialVersionId" IS NOT NULL
    AND "providerOrderRecordId" IS NOT NULL
    AND COALESCE(LENGTH(BTRIM("providerOrderId")), 0) > 0
    AND COALESCE(LENGTH(BTRIM("providerPaymentId")), 0) > 0
  )
);
