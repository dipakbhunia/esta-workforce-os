CREATE UNIQUE INDEX "BillingProviderCredential_id_providerConfigurationId_key"
ON "BillingProviderCredential"("id", "providerConfigurationId");

CREATE UNIQUE INDEX "PaymentProviderOrder_id_paymentId_key"
ON "PaymentProviderOrder"("id", "paymentId");

CREATE UNIQUE INDEX "PaymentProviderOrder_id_providerConfigurationId_key"
ON "PaymentProviderOrder"("id", "providerConfigurationId");

ALTER TABLE "PaymentAttempt"
DROP CONSTRAINT "PaymentAttempt_providerOrderRecordId_fkey";

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_providerOrderRecordId_paymentId_fkey"
FOREIGN KEY ("providerOrderRecordId", "paymentId")
REFERENCES "PaymentProviderOrder"("id", "paymentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
DROP CONSTRAINT "PaymentProviderEvent_paymentId_fkey";

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_paymentId_providerConfigurationId_fkey"
FOREIGN KEY ("paymentId", "providerConfigurationId")
REFERENCES "Payment"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
DROP CONSTRAINT "PaymentProviderEvent_providerOrderRecordId_fkey";

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_providerOrderRecordId_providerConfigurationId_fkey"
FOREIGN KEY ("providerOrderRecordId", "providerConfigurationId")
REFERENCES "PaymentProviderOrder"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_providerOrderRecordId_paymentId_fkey"
FOREIGN KEY ("providerOrderRecordId", "paymentId")
REFERENCES "PaymentProviderOrder"("id", "paymentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
DROP CONSTRAINT "PaymentProviderEvent_credentialVersionId_fkey";

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_credentialVersionId_providerConfigurationId_fkey"
FOREIGN KEY ("credentialVersionId", "providerConfigurationId")
REFERENCES "BillingProviderCredential"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_capture_fields_bidirectional_check"
CHECK (
  ("status" = 'CAPTURED') = (
    "capturedAt" IS NOT NULL
    AND COALESCE(LENGTH(BTRIM("capturedProviderPaymentId")), 0) > 0
  )
);
