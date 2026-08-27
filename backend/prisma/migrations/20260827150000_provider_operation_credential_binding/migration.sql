ALTER TABLE "PaymentAttempt"
ADD COLUMN "providerConfigurationId" UUID,
ADD COLUMN "credentialVersionId" UUID;

ALTER TABLE "PaymentProviderOrder"
ADD COLUMN "credentialVersionId" UUID NOT NULL;

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_credential_binding_pair_check"
CHECK (
  ("providerConfigurationId" IS NULL AND "credentialVersionId" IS NULL)
  OR ("providerConfigurationId" IS NOT NULL AND "credentialVersionId" IS NOT NULL)
);

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_order_create_credential_check"
CHECK (
  "operation" <> 'ORDER_CREATE'
  OR ("providerConfigurationId" IS NOT NULL AND "credentialVersionId" IS NOT NULL)
);

CREATE INDEX "PaymentAttempt_providerConfigurationId_idx"
ON "PaymentAttempt"("providerConfigurationId");

CREATE INDEX "PaymentAttempt_credentialVersionId_idx"
ON "PaymentAttempt"("credentialVersionId");

CREATE INDEX "PaymentProviderOrder_credentialVersionId_idx"
ON "PaymentProviderOrder"("credentialVersionId");

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_paymentId_providerConfigurationId_fkey"
FOREIGN KEY ("paymentId", "providerConfigurationId")
REFERENCES "Payment"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_credentialVersionId_providerConfigurationId_fkey"
FOREIGN KEY ("credentialVersionId", "providerConfigurationId")
REFERENCES "BillingProviderCredential"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderOrder"
ADD CONSTRAINT "PaymentProviderOrder_credentialVersionId_providerConfigurationId_fkey"
FOREIGN KEY ("credentialVersionId", "providerConfigurationId")
REFERENCES "BillingProviderCredential"("id", "providerConfigurationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
