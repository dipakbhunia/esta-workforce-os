CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION_ACTIVATION');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED');
CREATE TYPE "PaymentProviderOrderStatus" AS ENUM ('CREATED', 'PAID', 'CLOSED');
CREATE TYPE "PaymentAttemptOperation" AS ENUM ('ORDER_CREATE', 'CHECKOUT_CONFIRMATION', 'PROVIDER_PAYMENT', 'PROVIDER_FETCH', 'CAPTURE', 'WEBHOOK', 'RECONCILIATION');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "PaymentProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

ALTER TABLE "CompanySubscription"
ADD COLUMN "activatedByPaymentId" UUID;

DROP INDEX "BillingProviderConfiguration_provider_key";

CREATE UNIQUE INDEX "BillingProviderConfiguration_provider_mode_key"
ON "BillingProviderConfiguration"("provider", "mode");

CREATE UNIQUE INDEX "BillingProviderConfiguration_id_provider_mode_key"
ON "BillingProviderConfiguration"("id", "provider", "mode");

CREATE UNIQUE INDEX "CompanySubscription_activatedByPaymentId_key"
ON "CompanySubscription"("activatedByPaymentId");

CREATE UNIQUE INDEX "CompanySubscription_id_companyId_key"
ON "CompanySubscription"("id", "companyId");

CREATE UNIQUE INDEX "CompanySubscription_activatedByPaymentId_id_companyId_key"
ON "CompanySubscription"("activatedByPaymentId", "id", "companyId");

CREATE TABLE "BillingProviderCredential" (
  "id" UUID NOT NULL,
  "providerConfigurationId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "encryptedPayload" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  "webhookValidUntil" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingProviderCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingProviderCredential_version_check" CHECK ("version" >= 1),
  CONSTRAINT "BillingProviderCredential_encryption_key_version_check" CHECK (LENGTH(BTRIM("encryptionKeyVersion")) > 0),
  CONSTRAINT "BillingProviderCredential_fingerprint_check" CHECK (LENGTH(BTRIM("credentialFingerprint")) > 0),
  CONSTRAINT "BillingProviderCredential_retirement_check" CHECK ("retiredAt" IS NULL OR "retiredAt" >= "activeFrom"),
  CONSTRAINT "BillingProviderCredential_webhook_grace_check" CHECK (
    "webhookValidUntil" IS NULL
    OR ("retiredAt" IS NOT NULL AND "webhookValidUntil" >= "retiredAt")
  )
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "providerConfigurationId" UUID NOT NULL,
  "purpose" "PaymentPurpose" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" "PaymentProviderType" NOT NULL,
  "providerMode" "PaymentProviderMode" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "businessReference" TEXT NOT NULL,
  "capturedProviderPaymentId" TEXT,
  "providerStatus" TEXT,
  "failureCode" TEXT,
  "safeFailureMessage" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_amount_positive_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "Payment_amount_provider_safe_check" CHECK ("amountMinor" <= 9007199254740991),
  CONSTRAINT "Payment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Payment_idempotency_key_check" CHECK (LENGTH(BTRIM("idempotencyKey")) BETWEEN 8 AND 128),
  CONSTRAINT "Payment_business_reference_check" CHECK (LENGTH(BTRIM("businessReference")) BETWEEN 8 AND 120),
  CONSTRAINT "Payment_capture_fields_check" CHECK (
    "status" <> 'CAPTURED'
    OR ("capturedAt" IS NOT NULL AND COALESCE(LENGTH(BTRIM("capturedProviderPaymentId")), 0) > 0)
  ),
  CONSTRAINT "Payment_authorized_fields_check" CHECK ("status" <> 'AUTHORIZED' OR "authorizedAt" IS NOT NULL),
  CONSTRAINT "Payment_failed_fields_check" CHECK ("status" <> 'FAILED' OR "failedAt" IS NOT NULL)
);

CREATE TABLE "PaymentProviderOrder" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "providerConfigurationId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "PaymentProviderOrderStatus" NOT NULL DEFAULT 'CREATED',
  "providerOrderId" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "providerReceipt" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "providerCreatedAt" TIMESTAMP(3),
  "usableUntil" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "safeMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentProviderOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderOrder_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "PaymentProviderOrder_amount_positive_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentProviderOrder_amount_provider_safe_check" CHECK ("amountMinor" <= 9007199254740991),
  CONSTRAINT "PaymentProviderOrder_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentProviderOrder_reference_check" CHECK (
    LENGTH(BTRIM("providerOrderId")) > 0 AND LENGTH(BTRIM("providerReceipt")) > 0
  ),
  CONSTRAINT "PaymentProviderOrder_closed_state_check" CHECK (
    ("status" = 'CLOSED') = ("closedAt" IS NOT NULL)
  )
);

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "providerOrderRecordId" UUID,
  "sequence" INTEGER NOT NULL,
  "operation" "PaymentAttemptOperation" NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "providerStatus" TEXT,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "requestReference" TEXT NOT NULL,
  "failureCode" TEXT,
  "safeFailureMessage" TEXT,
  "safeMetadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "PaymentAttempt_amount_positive_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentAttempt_amount_provider_safe_check" CHECK ("amountMinor" <= 9007199254740991),
  CONSTRAINT "PaymentAttempt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PaymentAttempt_request_reference_check" CHECK (LENGTH(BTRIM("requestReference")) BETWEEN 8 AND 128),
  CONSTRAINT "PaymentAttempt_completion_check" CHECK (
    ("status" = 'PENDING' AND "completedAt" IS NULL)
    OR ("status" <> 'PENDING' AND "completedAt" IS NOT NULL)
  )
);

CREATE TABLE "PaymentProviderEvent" (
  "id" UUID NOT NULL,
  "paymentId" UUID,
  "providerOrderRecordId" UUID,
  "providerConfigurationId" UUID NOT NULL,
  "credentialVersionId" UUID NOT NULL,
  "provider" "PaymentProviderType" NOT NULL,
  "providerMode" "PaymentProviderMode" NOT NULL,
  "providerEventId" TEXT,
  "eventType" TEXT NOT NULL,
  "primaryEntityType" TEXT,
  "primaryEntityId" TEXT,
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "providerRefundId" TEXT,
  "providerCreatedAt" TIMESTAMP(3),
  "status" "PaymentProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payloadHash" TEXT NOT NULL,
  "normalizedPayloadVersion" INTEGER NOT NULL DEFAULT 1,
  "normalizedPayload" JSONB NOT NULL,
  "signatureVerifiedAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "nextRetryAt" TIMESTAMP(3),
  "safeErrorMessage" TEXT,

  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderEvent_event_type_check" CHECK (LENGTH(BTRIM("eventType")) > 0),
  CONSTRAINT "PaymentProviderEvent_payload_hash_check" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PaymentProviderEvent_normalized_version_check" CHECK ("normalizedPayloadVersion" >= 1),
  CONSTRAINT "PaymentProviderEvent_attempt_count_check" CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "BillingProviderCredential_providerConfigurationId_version_key"
ON "BillingProviderCredential"("providerConfigurationId", "version");
CREATE INDEX "BillingProviderCredential_providerConfigurationId_activeFrom_idx"
ON "BillingProviderCredential"("providerConfigurationId", "activeFrom");
CREATE INDEX "BillingProviderCredential_providerConfigurationId_retiredAt_webhookValidUntil_idx"
ON "BillingProviderCredential"("providerConfigurationId", "retiredAt", "webhookValidUntil");
CREATE INDEX "BillingProviderCredential_createdByUserId_idx"
ON "BillingProviderCredential"("createdByUserId");
CREATE UNIQUE INDEX "BillingProviderCredential_one_effective_idx"
ON "BillingProviderCredential"("providerConfigurationId") WHERE "retiredAt" IS NULL;

CREATE UNIQUE INDEX "Payment_businessReference_key" ON "Payment"("businessReference");
CREATE UNIQUE INDEX "Payment_companyId_idempotencyKey_key" ON "Payment"("companyId", "idempotencyKey");
CREATE UNIQUE INDEX "Payment_providerConfigurationId_capturedProviderPaymentId_key"
ON "Payment"("providerConfigurationId", "capturedProviderPaymentId");
CREATE UNIQUE INDEX "Payment_id_subscriptionId_companyId_key" ON "Payment"("id", "subscriptionId", "companyId");
CREATE UNIQUE INDEX "Payment_id_providerConfigurationId_key" ON "Payment"("id", "providerConfigurationId");
CREATE INDEX "Payment_companyId_createdAt_idx" ON "Payment"("companyId", "createdAt");
CREATE INDEX "Payment_subscriptionId_createdAt_idx" ON "Payment"("subscriptionId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_provider_providerMode_status_idx" ON "Payment"("provider", "providerMode", "status");
CREATE INDEX "Payment_providerConfigurationId_idx" ON "Payment"("providerConfigurationId");
CREATE INDEX "Payment_createdByUserId_idx" ON "Payment"("createdByUserId");
CREATE UNIQUE INDEX "Payment_one_subscription_activation_idx"
ON "Payment"("subscriptionId") WHERE "purpose" = 'SUBSCRIPTION_ACTIVATION';

CREATE UNIQUE INDEX "PaymentProviderOrder_paymentId_sequence_key" ON "PaymentProviderOrder"("paymentId", "sequence");
CREATE UNIQUE INDEX "PaymentProviderOrder_providerConfigurationId_providerOrderId_key"
ON "PaymentProviderOrder"("providerConfigurationId", "providerOrderId");
CREATE UNIQUE INDEX "PaymentProviderOrder_providerConfigurationId_providerReceipt_key"
ON "PaymentProviderOrder"("providerConfigurationId", "providerReceipt");
CREATE INDEX "PaymentProviderOrder_paymentId_createdAt_idx" ON "PaymentProviderOrder"("paymentId", "createdAt");
CREATE INDEX "PaymentProviderOrder_providerConfigurationId_status_idx" ON "PaymentProviderOrder"("providerConfigurationId", "status");
CREATE INDEX "PaymentProviderOrder_status_usableUntil_idx" ON "PaymentProviderOrder"("status", "usableUntil");
CREATE UNIQUE INDEX "PaymentProviderOrder_one_current_per_payment_idx"
ON "PaymentProviderOrder"("paymentId") WHERE "status" IN ('CREATED', 'PAID');

CREATE UNIQUE INDEX "PaymentAttempt_paymentId_sequence_key" ON "PaymentAttempt"("paymentId", "sequence");
CREATE UNIQUE INDEX "PaymentAttempt_paymentId_requestReference_key" ON "PaymentAttempt"("paymentId", "requestReference");
CREATE INDEX "PaymentAttempt_paymentId_createdAt_idx" ON "PaymentAttempt"("paymentId", "createdAt");
CREATE INDEX "PaymentAttempt_providerOrderRecordId_createdAt_idx" ON "PaymentAttempt"("providerOrderRecordId", "createdAt");
CREATE INDEX "PaymentAttempt_providerPaymentId_idx" ON "PaymentAttempt"("providerPaymentId");
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

CREATE INDEX "PaymentProviderEvent_status_nextRetryAt_receivedAt_idx"
ON "PaymentProviderEvent"("status", "nextRetryAt", "receivedAt");
CREATE INDEX "PaymentProviderEvent_paymentId_receivedAt_idx" ON "PaymentProviderEvent"("paymentId", "receivedAt");
CREATE INDEX "PaymentProviderEvent_providerOrderRecordId_receivedAt_idx"
ON "PaymentProviderEvent"("providerOrderRecordId", "receivedAt");
CREATE INDEX "PaymentProviderEvent_provider_providerMode_eventType_idx"
ON "PaymentProviderEvent"("provider", "providerMode", "eventType");
CREATE INDEX "PaymentProviderEvent_providerPaymentId_idx" ON "PaymentProviderEvent"("providerPaymentId");
CREATE INDEX "PaymentProviderEvent_providerRefundId_idx" ON "PaymentProviderEvent"("providerRefundId");
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_event_id_key"
ON "PaymentProviderEvent"("providerConfigurationId", "providerEventId") WHERE "providerEventId" IS NOT NULL;
CREATE UNIQUE INDEX "PaymentProviderEvent_verified_payload_hash_key"
ON "PaymentProviderEvent"("providerConfigurationId", "payloadHash");

ALTER TABLE "BillingProviderCredential"
ADD CONSTRAINT "BillingProviderCredential_providerConfigurationId_fkey"
FOREIGN KEY ("providerConfigurationId") REFERENCES "BillingProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingProviderCredential"
ADD CONSTRAINT "BillingProviderCredential_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_subscriptionId_companyId_fkey"
FOREIGN KEY ("subscriptionId", "companyId") REFERENCES "CompanySubscription"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_providerConfigurationId_provider_providerMode_fkey"
FOREIGN KEY ("providerConfigurationId", "provider", "providerMode") REFERENCES "BillingProviderConfiguration"("id", "provider", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderOrder"
ADD CONSTRAINT "PaymentProviderOrder_paymentId_providerConfigurationId_fkey"
FOREIGN KEY ("paymentId", "providerConfigurationId") REFERENCES "Payment"("id", "providerConfigurationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderOrder"
ADD CONSTRAINT "PaymentProviderOrder_providerConfigurationId_fkey"
FOREIGN KEY ("providerConfigurationId") REFERENCES "BillingProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt"
ADD CONSTRAINT "PaymentAttempt_providerOrderRecordId_fkey"
FOREIGN KEY ("providerOrderRecordId") REFERENCES "PaymentProviderOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_providerOrderRecordId_fkey"
FOREIGN KEY ("providerOrderRecordId") REFERENCES "PaymentProviderOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_providerConfigurationId_provider_providerMode_fkey"
FOREIGN KEY ("providerConfigurationId", "provider", "providerMode") REFERENCES "BillingProviderConfiguration"("id", "provider", "mode") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
ADD CONSTRAINT "PaymentProviderEvent_credentialVersionId_fkey"
FOREIGN KEY ("credentialVersionId") REFERENCES "BillingProviderCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanySubscription"
ADD CONSTRAINT "CompanySubscription_activatedByPaymentId_id_companyId_fkey"
FOREIGN KEY ("activatedByPaymentId", "id", "companyId") REFERENCES "Payment"("id", "subscriptionId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompanySubscription"
ADD CONSTRAINT "CompanySubscription_payment_activation_check"
CHECK (
  "activationSource" <> 'PAYMENT'
  OR "status" NOT IN ('ACTIVE', 'SUSPENDED', 'SUPERSEDED')
  OR "activatedByPaymentId" IS NOT NULL
);
