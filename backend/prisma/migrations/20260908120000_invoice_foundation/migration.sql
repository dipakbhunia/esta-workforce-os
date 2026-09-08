CREATE TABLE "CompanyBillingProfile" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "billingName" TEXT NOT NULL,
    "billingEmail" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBillingProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyBillingProfile_required_text_check" CHECK (
        LENGTH(BTRIM("billingName")) > 0
        AND LENGTH(BTRIM("addressLine1")) > 0
        AND LENGTH(BTRIM("city")) > 0
        AND LENGTH(BTRIM("postalCode")) > 0
        AND LENGTH(BTRIM("country")) > 0
    )
);

CREATE TABLE "InvoiceNumberSequence" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PLATFORM',
    "prefix" TEXT NOT NULL,
    "resetPolicy" "InvoiceNumberResetPolicy" NOT NULL,
    "resetBucket" TEXT NOT NULL,
    "lastAllocatedSequence" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceNumberSequence_scope_check" CHECK ("scope" = 'PLATFORM'),
    CONSTRAINT "InvoiceNumberSequence_prefix_check" CHECK ("prefix" ~ '^[A-Z0-9][A-Z0-9_/-]{0,19}$'),
    CONSTRAINT "InvoiceNumberSequence_bucket_check" CHECK (LENGTH(BTRIM("resetBucket")) > 0),
    CONSTRAINT "InvoiceNumberSequence_value_check" CHECK ("lastAllocatedSequence" >= 0)
);

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourcePaymentId" UUID NOT NULL,
    "sourceSubscriptionId" UUID NOT NULL,
    "sourcePaymentPurpose" "PaymentPurpose" NOT NULL,
    "sourceCapturedAt" TIMESTAMP(3) NOT NULL,
    "capturedPaymentReference" TEXT NOT NULL,
    "numberSequenceId" UUID NOT NULL,
    "numberPrefix" TEXT NOT NULL,
    "numberResetPolicy" "InvoiceNumberResetPolicy" NOT NULL,
    "numberResetBucket" TEXT NOT NULL,
    "numberSequence" BIGINT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "servicePeriodStart" TIMESTAMP(3) NOT NULL,
    "servicePeriodEnd" TIMESTAMP(3) NOT NULL,
    "sellerLegalName" TEXT NOT NULL,
    "sellerBillingEmail" TEXT,
    "sellerAddressLine1" TEXT NOT NULL,
    "sellerAddressLine2" TEXT,
    "sellerCity" TEXT NOT NULL,
    "sellerState" TEXT,
    "sellerStateCode" TEXT,
    "sellerPostalCode" TEXT NOT NULL,
    "sellerCountry" TEXT NOT NULL,
    "billToName" TEXT NOT NULL,
    "billToBillingEmail" TEXT,
    "billToAddressLine1" TEXT NOT NULL,
    "billToAddressLine2" TEXT,
    "billToCity" TEXT NOT NULL,
    "billToState" TEXT,
    "billToPostalCode" TEXT NOT NULL,
    "billToCountry" TEXT NOT NULL,
    "billToPhone" TEXT,
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invoice_number_sequence_check" CHECK ("numberSequence" > 0),
    CONSTRAINT "Invoice_amounts_check" CHECK ("subtotalMinor" > 0 AND "totalMinor" > 0 AND "subtotalMinor" = "totalMinor"),
    CONSTRAINT "Invoice_service_period_check" CHECK ("servicePeriodStart" < "servicePeriodEnd"),
    CONSTRAINT "Invoice_due_at_check" CHECK ("dueAt" IS NULL OR "dueAt" >= "issuedAt"),
    CONSTRAINT "Invoice_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "Invoice_required_text_check" CHECK (
        LENGTH(BTRIM("capturedPaymentReference")) > 0
        AND LENGTH(BTRIM("numberPrefix")) > 0
        AND LENGTH(BTRIM("numberResetBucket")) > 0
        AND LENGTH(BTRIM("invoiceNumber")) > 0
        AND LENGTH(BTRIM("sellerLegalName")) > 0
        AND LENGTH(BTRIM("sellerAddressLine1")) > 0
        AND LENGTH(BTRIM("sellerCity")) > 0
        AND LENGTH(BTRIM("sellerPostalCode")) > 0
        AND LENGTH(BTRIM("sellerCountry")) > 0
        AND LENGTH(BTRIM("billToName")) > 0
        AND LENGTH(BTRIM("billToAddressLine1")) > 0
        AND LENGTH(BTRIM("billToCity")) > 0
        AND LENGTH(BTRIM("billToPostalCode")) > 0
        AND LENGTH(BTRIM("billToCountry")) > 0
    )
);

CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "sourceSubscriptionId" UUID NOT NULL,
    "sourcePlanId" UUID NOT NULL,
    "planCodeSnapshot" TEXT NOT NULL,
    "planNameSnapshot" TEXT NOT NULL,
    "lineSequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmountMinor" BIGINT NOT NULL,
    "lineSubtotalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceLine_positive_values_check" CHECK (
        "lineSequence" > 0
        AND "quantity" > 0
        AND "unitAmountMinor" > 0
        AND "lineSubtotalMinor" > 0
    ),
    CONSTRAINT "InvoiceLine_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "InvoiceLine_required_text_check" CHECK (
        LENGTH(BTRIM("description")) > 0
        AND LENGTH(BTRIM("planCodeSnapshot")) > 0
        AND LENGTH(BTRIM("planNameSnapshot")) > 0
    )
);

CREATE UNIQUE INDEX "CompanyBillingProfile_companyId_key" ON "CompanyBillingProfile"("companyId");
CREATE UNIQUE INDEX "InvoiceNumberSequence_scope_prefix_resetPolicy_resetBucket_key" ON "InvoiceNumberSequence"("scope", "prefix", "resetPolicy", "resetBucket");
CREATE UNIQUE INDEX "InvoiceNumberSequence_id_prefix_resetPolicy_resetBucket_key" ON "InvoiceNumberSequence"("id", "prefix", "resetPolicy", "resetBucket");
CREATE UNIQUE INDEX "CompanySubscription_id_companyId_planId_key" ON "CompanySubscription"("id", "companyId", "planId");
CREATE UNIQUE INDEX "Invoice_sourcePaymentId_sourceSubscriptionId_companyId_key" ON "Invoice"("sourcePaymentId", "sourceSubscriptionId", "companyId");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_id_companyId_sourceSubscriptionId_key" ON "Invoice"("id", "companyId", "sourceSubscriptionId");
CREATE INDEX "Invoice_companyId_issuedAt_idx" ON "Invoice"("companyId", "issuedAt");
CREATE INDEX "Invoice_sourceSubscriptionId_idx" ON "Invoice"("sourceSubscriptionId");
CREATE INDEX "Invoice_numberSequenceId_idx" ON "Invoice"("numberSequenceId");
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_lineSequence_key" ON "InvoiceLine"("invoiceId", "lineSequence");
CREATE INDEX "InvoiceLine_sourceSubscriptionId_idx" ON "InvoiceLine"("sourceSubscriptionId");
CREATE INDEX "InvoiceLine_sourcePlanId_idx" ON "InvoiceLine"("sourcePlanId");

ALTER TABLE "CompanyBillingProfile" ADD CONSTRAINT "CompanyBillingProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourcePaymentId_sourceSubscriptionId_companyId_fkey" FOREIGN KEY ("sourcePaymentId", "sourceSubscriptionId", "companyId") REFERENCES "Payment"("id", "subscriptionId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceSubscriptionId_companyId_fkey" FOREIGN KEY ("sourceSubscriptionId", "companyId") REFERENCES "CompanySubscription"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_numberSequenceId_numberPrefix_numberResetPolicy_numberResetBucket_fkey" FOREIGN KEY ("numberSequenceId", "numberPrefix", "numberResetPolicy", "numberResetBucket") REFERENCES "InvoiceNumberSequence"("id", "prefix", "resetPolicy", "resetBucket") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_companyId_sourceSubscriptionId_fkey" FOREIGN KEY ("invoiceId", "companyId", "sourceSubscriptionId") REFERENCES "Invoice"("id", "companyId", "sourceSubscriptionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_sourceSubscriptionId_companyId_sourcePlanId_fkey" FOREIGN KEY ("sourceSubscriptionId", "companyId", "sourcePlanId") REFERENCES "CompanySubscription"("id", "companyId", "planId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
