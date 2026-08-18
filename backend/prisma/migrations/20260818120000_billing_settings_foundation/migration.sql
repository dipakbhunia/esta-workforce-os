CREATE TYPE "InvoiceNumberResetPolicy" AS ENUM ('NEVER', 'CALENDAR_YEAR', 'FINANCIAL_YEAR');
CREATE TYPE "RenewalMode" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "PaymentProviderType" AS ENUM ('RAZORPAY');
CREATE TYPE "PaymentProviderMode" AS ENUM ('TEST', 'LIVE');

CREATE TABLE "BillingSettings" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PLATFORM',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "invoiceNumberResetPolicy" "InvoiceNumberResetPolicy" NOT NULL DEFAULT 'NEVER',
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 15,
    "defaultInvoiceNotes" TEXT,
    "sellerLegalName" TEXT,
    "sellerBillingEmail" TEXT,
    "sellerAddressLine1" TEXT,
    "sellerAddressLine2" TEXT,
    "sellerCity" TEXT,
    "sellerState" TEXT,
    "sellerStateCode" TEXT,
    "sellerPostalCode" TEXT,
    "sellerCountry" TEXT,
    "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT,
    "gstLegalName" TEXT,
    "gstRegisteredState" TEXT,
    "gstRegisteredStateCode" TEXT,
    "renewalMode" "RenewalMode" NOT NULL DEFAULT 'MANUAL',
    "renewalLeadDays" INTEGER NOT NULL DEFAULT 0,
    "renewalGracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "renewalReminderDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingSettings_platform_scope_check" CHECK ("scope" = 'PLATFORM'),
    CONSTRAINT "BillingSettings_invoice_prefix_check" CHECK ("invoicePrefix" ~ '^[A-Z0-9][A-Z0-9_/-]{0,19}$'),
    CONSTRAINT "BillingSettings_payment_terms_check" CHECK ("defaultPaymentTermsDays" BETWEEN 0 AND 365),
    CONSTRAINT "BillingSettings_renewal_lead_check" CHECK ("renewalLeadDays" BETWEEN 0 AND 365),
    CONSTRAINT "BillingSettings_renewal_grace_check" CHECK ("renewalGracePeriodDays" BETWEEN 0 AND 365),
    CONSTRAINT "BillingSettings_gstin_check" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    CONSTRAINT "BillingSettings_gst_enabled_check" CHECK (NOT "gstEnabled" OR ("gstin" IS NOT NULL AND COALESCE(NULLIF(BTRIM("gstLegalName"), ''), NULLIF(BTRIM("sellerLegalName"), '')) IS NOT NULL))
);

CREATE TABLE "BillingProviderConfiguration" (
    "id" UUID NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "mode" "PaymentProviderMode" NOT NULL DEFAULT 'TEST',
    "displayName" TEXT,
    "accountReference" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProviderConfiguration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillingProviderConfiguration_default_requires_enabled_check" CHECK (NOT "isDefault" OR "enabled")
);

CREATE UNIQUE INDEX "BillingSettings_scope_key" ON "BillingSettings"("scope");
CREATE INDEX "BillingSettings_updatedById_idx" ON "BillingSettings"("updatedById");

CREATE UNIQUE INDEX "BillingProviderConfiguration_provider_key" ON "BillingProviderConfiguration"("provider");
CREATE INDEX "BillingProviderConfiguration_enabled_isDefault_idx" ON "BillingProviderConfiguration"("enabled", "isDefault");
CREATE INDEX "BillingProviderConfiguration_updatedById_idx" ON "BillingProviderConfiguration"("updatedById");
CREATE UNIQUE INDEX "BillingProviderConfiguration_one_enabled_default_idx"
ON "BillingProviderConfiguration"("isDefault")
WHERE "enabled" = true AND "isDefault" = true;

ALTER TABLE "BillingSettings"
ADD CONSTRAINT "BillingSettings_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingProviderConfiguration"
ADD CONSTRAINT "BillingProviderConfiguration_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
