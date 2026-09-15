CREATE TYPE "GstTaxTreatment" AS ENUM ('TAXABLE', 'NON_TAXABLE');
CREATE TYPE "GstJurisdictionClassification" AS ENUM ('INTRA_STATE', 'INTER_STATE');
CREATE TYPE "GstTaxComponentType" AS ENUM ('CGST', 'SGST', 'IGST');
CREATE TYPE "GstTaxPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "GstRoundingMode" AS ENUM ('HALF_UP_MINOR_UNIT_PER_COMPONENT');
CREATE TYPE "GstRegistrationStatus" AS ENUM ('REGISTERED', 'UNREGISTERED');

ALTER TABLE "CompanyBillingProfile"
  ADD COLUMN "gstRegistrationStatus" "GstRegistrationStatus",
  ADD COLUMN "gstin" TEXT,
  ADD COLUMN "billingStateCode" TEXT,
  ADD COLUMN "placeOfSupplyState" TEXT,
  ADD COLUMN "placeOfSupplyStateCode" TEXT;

ALTER TABLE "Invoice" ADD COLUMN "totalTaxMinor" BIGINT;

CREATE TABLE "GstTaxPolicyVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "policyCode" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "status" "GstTaxPolicyStatus" NOT NULL DEFAULT 'DRAFT', "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3), "currency" TEXT NOT NULL, "treatment" "GstTaxTreatment" NOT NULL,
  "totalRateBasisPoints" INTEGER NOT NULL, "cgstRateBasisPoints" INTEGER NOT NULL,
  "sgstRateBasisPoints" INTEGER NOT NULL, "igstRateBasisPoints" INTEGER NOT NULL,
  "serviceClassification" TEXT, "roundingMode" "GstRoundingMode" NOT NULL DEFAULT 'HALF_UP_MINOR_UNIT_PER_COMPONENT',
  "calculationVersion" INTEGER NOT NULL DEFAULT 1, "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GstTaxPolicyVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GstTaxPolicyVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "GstTaxPolicyVersion_effective_check" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom"),
  CONSTRAINT "GstTaxPolicyVersion_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "GstTaxPolicyVersion_rate_bounds_check" CHECK ("totalRateBasisPoints" BETWEEN 0 AND 10000 AND "cgstRateBasisPoints" BETWEEN 0 AND 10000 AND "sgstRateBasisPoints" BETWEEN 0 AND 10000 AND "igstRateBasisPoints" BETWEEN 0 AND 10000),
  CONSTRAINT "GstTaxPolicyVersion_rate_reconciliation_check" CHECK (("treatment" = 'NON_TAXABLE' AND "totalRateBasisPoints" = 0 AND "cgstRateBasisPoints" = 0 AND "sgstRateBasisPoints" = 0 AND "igstRateBasisPoints" = 0) OR ("treatment" = 'TAXABLE' AND "totalRateBasisPoints" = "cgstRateBasisPoints" + "sgstRateBasisPoints" AND "totalRateBasisPoints" = "igstRateBasisPoints")),
  CONSTRAINT "GstTaxPolicyVersion_calculation_version_check" CHECK ("calculationVersion" > 0)
);

CREATE UNIQUE INDEX "GstTaxPolicyVersion_policyCode_version_key" ON "GstTaxPolicyVersion"("policyCode", "version");
CREATE INDEX "GstTaxPolicyVersion_status_currency_effectiveFrom_idx" ON "GstTaxPolicyVersion"("status", "currency", "effectiveFrom");
CREATE INDEX "GstTaxPolicyVersion_createdByUserId_idx" ON "GstTaxPolicyVersion"("createdByUserId");
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "GstTaxPolicyVersion" ADD CONSTRAINT "GstTaxPolicyVersion_active_window_excl"
  EXCLUDE USING gist ("currency" WITH =, tsrange("effectiveFrom", COALESCE("effectiveUntil", 'infinity'::timestamp), '[)') WITH &&)
  WHERE ("status" = 'ACTIVE');

CREATE TABLE "PaymentTaxSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "paymentId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "sourceSubscriptionId" UUID NOT NULL, "policyVersionId" UUID NOT NULL, "treatment" "GstTaxTreatment" NOT NULL,
  "calculationVersion" INTEGER NOT NULL, "decisionAt" TIMESTAMP(3) NOT NULL, "currency" TEXT NOT NULL,
  "taxableSubtotalMinor" BIGINT NOT NULL, "totalTaxMinor" BIGINT NOT NULL, "grossTotalMinor" BIGINT NOT NULL,
  "jurisdictionClassification" "GstJurisdictionClassification", "serviceClassification" TEXT,
  "roundingMode" "GstRoundingMode" NOT NULL, "sellerGstin" TEXT, "sellerLegalName" TEXT,
  "sellerRegisteredState" TEXT, "sellerRegisteredStateCode" TEXT, "buyerRegistrationStatus" "GstRegistrationStatus",
  "buyerGstin" TEXT, "buyerBillingState" TEXT, "buyerBillingStateCode" TEXT, "placeOfSupplyState" TEXT,
  "placeOfSupplyStateCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentTaxSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTaxSnapshot_money_check" CHECK ("taxableSubtotalMinor" > 0 AND "taxableSubtotalMinor" <= 9007199254740991 AND "totalTaxMinor" >= 0 AND "totalTaxMinor" <= 9007199254740991 AND "grossTotalMinor" > 0 AND "grossTotalMinor" <= 9007199254740991 AND "taxableSubtotalMinor" + "totalTaxMinor" = "grossTotalMinor"),
  CONSTRAINT "PaymentTaxSnapshot_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "PaymentTaxSnapshot_calculation_version_check" CHECK ("calculationVersion" > 0),
  CONSTRAINT "PaymentTaxSnapshot_treatment_evidence_check" CHECK (("treatment" = 'NON_TAXABLE' AND "totalTaxMinor" = 0 AND "jurisdictionClassification" IS NULL) OR ("treatment" = 'TAXABLE' AND "jurisdictionClassification" IS NOT NULL AND "serviceClassification" IS NOT NULL AND "sellerGstin" IS NOT NULL AND "sellerLegalName" IS NOT NULL AND "sellerRegisteredState" IS NOT NULL AND "sellerRegisteredStateCode" IS NOT NULL AND "buyerRegistrationStatus" IS NOT NULL AND "buyerBillingState" IS NOT NULL AND "buyerBillingStateCode" IS NOT NULL AND "placeOfSupplyState" IS NOT NULL AND "placeOfSupplyStateCode" IS NOT NULL)),
  CONSTRAINT "PaymentTaxSnapshot_buyer_registration_check" CHECK (("buyerRegistrationStatus" = 'REGISTERED' AND "buyerGstin" IS NOT NULL) OR "buyerRegistrationStatus" IS DISTINCT FROM 'REGISTERED'),
  CONSTRAINT "PaymentTaxSnapshot_state_codes_check" CHECK (("sellerRegisteredStateCode" IS NULL OR "sellerRegisteredStateCode" ~ '^[0-9]{2}$') AND ("buyerBillingStateCode" IS NULL OR "buyerBillingStateCode" ~ '^[0-9]{2}$') AND ("placeOfSupplyStateCode" IS NULL OR "placeOfSupplyStateCode" ~ '^[0-9]{2}$'))
);

CREATE UNIQUE INDEX "PaymentTaxSnapshot_paymentId_key" ON "PaymentTaxSnapshot"("paymentId");
CREATE UNIQUE INDEX "PaymentTaxSnapshot_id_paymentId_key" ON "PaymentTaxSnapshot"("id", "paymentId");
CREATE UNIQUE INDEX "PaymentTaxSnapshot_paymentId_sourceSubscriptionId_companyId_key" ON "PaymentTaxSnapshot"("paymentId", "sourceSubscriptionId", "companyId");
CREATE INDEX "PaymentTaxSnapshot_companyId_decisionAt_idx" ON "PaymentTaxSnapshot"("companyId", "decisionAt");
CREATE INDEX "PaymentTaxSnapshot_sourceSubscriptionId_idx" ON "PaymentTaxSnapshot"("sourceSubscriptionId");
CREATE INDEX "PaymentTaxSnapshot_policyVersionId_idx" ON "PaymentTaxSnapshot"("policyVersionId");
CREATE INDEX "PaymentTaxSnapshot_treatment_decisionAt_idx" ON "PaymentTaxSnapshot"("treatment", "decisionAt");

CREATE TABLE "PaymentTaxComponent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "paymentTaxSnapshotId" UUID NOT NULL,
  "type" "GstTaxComponentType" NOT NULL, "rateBasisPoints" INTEGER NOT NULL,
  "taxableAmountMinor" BIGINT NOT NULL, "taxAmountMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentTaxComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTaxComponent_rate_check" CHECK ("rateBasisPoints" BETWEEN 0 AND 10000),
  CONSTRAINT "PaymentTaxComponent_money_check" CHECK ("taxableAmountMinor" > 0 AND "taxableAmountMinor" <= 9007199254740991 AND "taxAmountMinor" >= 0 AND "taxAmountMinor" <= 9007199254740991),
  CONSTRAINT "PaymentTaxComponent_currency_check" CHECK ("currency" = 'INR')
);
CREATE UNIQUE INDEX "PaymentTaxComponent_paymentTaxSnapshotId_type_key" ON "PaymentTaxComponent"("paymentTaxSnapshotId", "type");
CREATE INDEX "PaymentTaxComponent_paymentTaxSnapshotId_idx" ON "PaymentTaxComponent"("paymentTaxSnapshotId");

CREATE TABLE "InvoiceGstEvidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "invoiceId" UUID NOT NULL, "sourcePaymentId" UUID NOT NULL,
  "paymentTaxSnapshotId" UUID NOT NULL, "treatment" "GstTaxTreatment" NOT NULL, "policyCode" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL, "calculationVersion" INTEGER NOT NULL, "decisionAt" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL, "taxableSubtotalMinor" BIGINT NOT NULL, "totalTaxMinor" BIGINT NOT NULL,
  "grossTotalMinor" BIGINT NOT NULL, "jurisdictionClassification" "GstJurisdictionClassification",
  "serviceClassification" TEXT, "roundingMode" "GstRoundingMode" NOT NULL, "sellerGstin" TEXT,
  "sellerLegalName" TEXT, "sellerRegisteredState" TEXT, "sellerRegisteredStateCode" TEXT,
  "buyerRegistrationStatus" "GstRegistrationStatus", "buyerGstin" TEXT, "buyerBillingState" TEXT,
  "buyerBillingStateCode" TEXT, "placeOfSupplyState" TEXT, "placeOfSupplyStateCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceGstEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceGstEvidence_money_check" CHECK ("taxableSubtotalMinor" > 0 AND "taxableSubtotalMinor" <= 9007199254740991 AND "totalTaxMinor" >= 0 AND "totalTaxMinor" <= 9007199254740991 AND "grossTotalMinor" > 0 AND "grossTotalMinor" <= 9007199254740991 AND "taxableSubtotalMinor" + "totalTaxMinor" = "grossTotalMinor"),
  CONSTRAINT "InvoiceGstEvidence_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "InvoiceGstEvidence_version_check" CHECK ("policyVersion" > 0 AND "calculationVersion" > 0)
);
CREATE UNIQUE INDEX "InvoiceGstEvidence_invoiceId_key" ON "InvoiceGstEvidence"("invoiceId");
CREATE UNIQUE INDEX "InvoiceGstEvidence_paymentTaxSnapshotId_key" ON "InvoiceGstEvidence"("paymentTaxSnapshotId");
CREATE UNIQUE INDEX "InvoiceGstEvidence_invoiceId_sourcePaymentId_key" ON "InvoiceGstEvidence"("invoiceId", "sourcePaymentId");
CREATE UNIQUE INDEX "InvoiceGstEvidence_paymentTaxSnapshotId_sourcePaymentId_key" ON "InvoiceGstEvidence"("paymentTaxSnapshotId", "sourcePaymentId");
CREATE INDEX "InvoiceGstEvidence_treatment_invoiceId_idx" ON "InvoiceGstEvidence"("treatment", "invoiceId");

CREATE TABLE "InvoiceLineGstEvidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "invoiceLineId" UUID NOT NULL, "treatment" "GstTaxTreatment" NOT NULL,
  "jurisdictionClassification" "GstJurisdictionClassification",
  "currency" TEXT NOT NULL, "taxableAmountMinor" BIGINT NOT NULL, "totalTaxMinor" BIGINT NOT NULL,
  "grossAmountMinor" BIGINT NOT NULL, "serviceClassification" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceLineGstEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceLineGstEvidence_money_check" CHECK ("taxableAmountMinor" > 0 AND "taxableAmountMinor" <= 9007199254740991 AND "totalTaxMinor" >= 0 AND "totalTaxMinor" <= 9007199254740991 AND "grossAmountMinor" > 0 AND "grossAmountMinor" <= 9007199254740991 AND "taxableAmountMinor" + "totalTaxMinor" = "grossAmountMinor"),
  CONSTRAINT "InvoiceLineGstEvidence_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "InvoiceLineGstEvidence_treatment_check" CHECK (("treatment" = 'NON_TAXABLE' AND "totalTaxMinor" = 0 AND "jurisdictionClassification" IS NULL) OR ("treatment" = 'TAXABLE' AND "jurisdictionClassification" IS NOT NULL))
);
CREATE UNIQUE INDEX "InvoiceLineGstEvidence_invoiceLineId_key" ON "InvoiceLineGstEvidence"("invoiceLineId");

CREATE TABLE "InvoiceLineTaxComponent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "invoiceLineGstEvidenceId" UUID NOT NULL,
  "type" "GstTaxComponentType" NOT NULL, "rateBasisPoints" INTEGER NOT NULL,
  "taxAmountMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceLineTaxComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceLineTaxComponent_rate_check" CHECK ("rateBasisPoints" BETWEEN 0 AND 10000),
  CONSTRAINT "InvoiceLineTaxComponent_money_check" CHECK ("taxAmountMinor" >= 0 AND "taxAmountMinor" <= 9007199254740991),
  CONSTRAINT "InvoiceLineTaxComponent_currency_check" CHECK ("currency" = 'INR')
);
CREATE UNIQUE INDEX "InvoiceLineTaxComponent_invoiceLineGstEvidenceId_type_key" ON "InvoiceLineTaxComponent"("invoiceLineGstEvidenceId", "type");
CREATE INDEX "InvoiceLineTaxComponent_invoiceLineGstEvidenceId_idx" ON "InvoiceLineTaxComponent"("invoiceLineGstEvidenceId");

CREATE UNIQUE INDEX "Invoice_id_sourcePaymentId_key" ON "Invoice"("id", "sourcePaymentId");
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_amounts_check";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK (
  "subtotalMinor" > 0 AND "subtotalMinor" <= 9007199254740991 AND
  "totalMinor" > 0 AND "totalMinor" <= 9007199254740991 AND
  (("totalTaxMinor" IS NULL AND "subtotalMinor" = "totalMinor") OR
   ("totalTaxMinor" IS NOT NULL AND "totalTaxMinor" >= 0 AND "totalTaxMinor" <= 9007199254740991 AND "subtotalMinor" + "totalTaxMinor" = "totalMinor"))
);
ALTER TABLE "CompanyBillingProfile" ADD CONSTRAINT "CompanyBillingProfile_gst_registration_check" CHECK (("gstRegistrationStatus" = 'REGISTERED' AND "gstin" IS NOT NULL) OR ("gstRegistrationStatus" = 'UNREGISTERED' AND "gstin" IS NULL) OR "gstRegistrationStatus" IS NULL);
ALTER TABLE "CompanyBillingProfile" ADD CONSTRAINT "CompanyBillingProfile_state_codes_check" CHECK (("billingStateCode" IS NULL OR "billingStateCode" ~ '^[0-9]{2}$') AND ("placeOfSupplyStateCode" IS NULL OR "placeOfSupplyStateCode" ~ '^[0-9]{2}$'));

ALTER TABLE "GstTaxPolicyVersion" ADD CONSTRAINT "GstTaxPolicyVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentTaxSnapshot" ADD CONSTRAINT "PaymentTaxSnapshot_paymentId_sourceSubscriptionId_companyId_fkey" FOREIGN KEY ("paymentId", "sourceSubscriptionId", "companyId") REFERENCES "Payment"("id", "subscriptionId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTaxSnapshot" ADD CONSTRAINT "PaymentTaxSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTaxSnapshot" ADD CONSTRAINT "PaymentTaxSnapshot_sourceSubscriptionId_companyId_fkey" FOREIGN KEY ("sourceSubscriptionId", "companyId") REFERENCES "CompanySubscription"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTaxSnapshot" ADD CONSTRAINT "PaymentTaxSnapshot_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "GstTaxPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTaxComponent" ADD CONSTRAINT "PaymentTaxComponent_paymentTaxSnapshotId_fkey" FOREIGN KEY ("paymentTaxSnapshotId") REFERENCES "PaymentTaxSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceGstEvidence" ADD CONSTRAINT "InvoiceGstEvidence_invoiceId_sourcePaymentId_fkey" FOREIGN KEY ("invoiceId", "sourcePaymentId") REFERENCES "Invoice"("id", "sourcePaymentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceGstEvidence" ADD CONSTRAINT "InvoiceGstEvidence_paymentTaxSnapshotId_sourcePaymentId_fkey" FOREIGN KEY ("paymentTaxSnapshotId", "sourcePaymentId") REFERENCES "PaymentTaxSnapshot"("id", "paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineGstEvidence" ADD CONSTRAINT "InvoiceLineGstEvidence_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineTaxComponent" ADD CONSTRAINT "InvoiceLineTaxComponent_invoiceLineGstEvidenceId_fkey" FOREIGN KEY ("invoiceLineGstEvidenceId") REFERENCES "InvoiceLineGstEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validate_payment_tax_snapshot_components"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE component_count integer; component_total bigint;
BEGIN
  SELECT count(*), COALESCE(sum("taxAmountMinor"), 0) INTO component_count, component_total FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId" = NEW."id";
  IF NEW."treatment" = 'NON_TAXABLE' AND component_count <> 0 THEN RAISE EXCEPTION 'Non-taxable snapshot cannot have components'; END IF;
  IF NEW."treatment" = 'TAXABLE' AND (component_total <> NEW."totalTaxMinor" OR component_count = 0) THEN RAISE EXCEPTION 'Tax components do not reconcile'; END IF;
  IF NEW."jurisdictionClassification" = 'INTRA_STATE' AND NOT (component_count = 2 AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=NEW."id" AND "type"='CGST') AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=NEW."id" AND "type"='SGST')) THEN RAISE EXCEPTION 'Intra-state components invalid'; END IF;
  IF NEW."jurisdictionClassification" = 'INTER_STATE' AND NOT (component_count = 1 AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=NEW."id" AND "type"='IGST')) THEN RAISE EXCEPTION 'Inter-state components invalid'; END IF;
  RETURN NULL;
END $$;
CREATE FUNCTION "validate_payment_tax_component_parent"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot_id uuid; s "PaymentTaxSnapshot"%ROWTYPE; component_count integer; component_total bigint;
BEGIN
  snapshot_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."paymentTaxSnapshotId" ELSE NEW."paymentTaxSnapshotId" END;
  SELECT * INTO s FROM "PaymentTaxSnapshot" WHERE "id" = snapshot_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), COALESCE(sum("taxAmountMinor"), 0) INTO component_count, component_total FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId" = snapshot_id;
  IF s."treatment" = 'NON_TAXABLE' AND component_count <> 0 THEN RAISE EXCEPTION 'Non-taxable snapshot cannot have components'; END IF;
  IF s."treatment" = 'TAXABLE' AND (component_total <> s."totalTaxMinor" OR component_count = 0) THEN RAISE EXCEPTION 'Tax components do not reconcile'; END IF;
  IF s."jurisdictionClassification" = 'INTRA_STATE' AND NOT (component_count = 2 AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=snapshot_id AND "type"='CGST') AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=snapshot_id AND "type"='SGST')) THEN RAISE EXCEPTION 'Intra-state components invalid'; END IF;
  IF s."jurisdictionClassification" = 'INTER_STATE' AND NOT (component_count = 1 AND EXISTS (SELECT 1 FROM "PaymentTaxComponent" WHERE "paymentTaxSnapshotId"=snapshot_id AND "type"='IGST')) THEN RAISE EXCEPTION 'Inter-state components invalid'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "PaymentTaxSnapshot_components_check" AFTER INSERT OR UPDATE ON "PaymentTaxSnapshot" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_payment_tax_snapshot_components"();
CREATE CONSTRAINT TRIGGER "PaymentTaxComponent_parent_check" AFTER INSERT OR UPDATE OR DELETE ON "PaymentTaxComponent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_payment_tax_component_parent"();

CREATE FUNCTION "validate_invoice_line_gst_evidence"(evidence_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE e "InvoiceLineGstEvidence"%ROWTYPE; component_count integer; component_total bigint; invalid_components integer; invoice_evidence "InvoiceGstEvidence"%ROWTYPE; line "InvoiceLine"%ROWTYPE; invoice_currency text;
BEGIN
  SELECT * INTO e FROM "InvoiceLineGstEvidence" WHERE "id" = evidence_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO line FROM "InvoiceLine" WHERE "id" = e."invoiceLineId";
  SELECT * INTO invoice_evidence FROM "InvoiceGstEvidence" WHERE "invoiceId" = line."invoiceId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line GST ownership or amounts do not reconcile'; END IF;
  SELECT "currency" INTO invoice_currency FROM "Invoice" WHERE "id" = line."invoiceId";
  IF NOT FOUND OR e."treatment" <> invoice_evidence."treatment" OR e."jurisdictionClassification" IS DISTINCT FROM invoice_evidence."jurisdictionClassification" OR e."currency" <> invoice_evidence."currency" OR e."currency" <> line."currency" OR e."currency" <> invoice_currency OR e."taxableAmountMinor" <> line."lineSubtotalMinor" OR e."taxableAmountMinor" <> invoice_evidence."taxableSubtotalMinor" OR e."totalTaxMinor" <> invoice_evidence."totalTaxMinor" OR e."grossAmountMinor" <> invoice_evidence."grossTotalMinor" THEN RAISE EXCEPTION 'Invoice line GST ownership or amounts do not reconcile'; END IF;
  SELECT count(*), COALESCE(sum("taxAmountMinor"), 0), count(*) FILTER (WHERE "currency" <> e."currency" OR "taxAmountMinor"::numeric <> floor((e."taxableAmountMinor"::numeric * "rateBasisPoints"::numeric + 5000::numeric) / 10000::numeric)) INTO component_count, component_total, invalid_components FROM "InvoiceLineTaxComponent" WHERE "invoiceLineGstEvidenceId" = evidence_id;
  IF invalid_components <> 0 OR component_total <> e."totalTaxMinor" THEN RAISE EXCEPTION 'Invoice line GST components do not reconcile'; END IF;
  IF e."treatment" = 'NON_TAXABLE' AND component_count <> 0 THEN RAISE EXCEPTION 'Non-taxable invoice line cannot have components'; END IF;
  IF e."jurisdictionClassification" = 'INTRA_STATE' AND NOT (component_count = 2 AND EXISTS (SELECT 1 FROM "InvoiceLineTaxComponent" WHERE "invoiceLineGstEvidenceId"=evidence_id AND "type"='CGST') AND EXISTS (SELECT 1 FROM "InvoiceLineTaxComponent" WHERE "invoiceLineGstEvidenceId"=evidence_id AND "type"='SGST')) THEN RAISE EXCEPTION 'Intra-state invoice line components invalid'; END IF;
  IF e."jurisdictionClassification" = 'INTER_STATE' AND NOT (component_count = 1 AND EXISTS (SELECT 1 FROM "InvoiceLineTaxComponent" WHERE "invoiceLineGstEvidenceId"=evidence_id AND "type"='IGST')) THEN RAISE EXCEPTION 'Inter-state invoice line components invalid'; END IF;
END $$;
CREATE FUNCTION "validate_invoice_line_gst_evidence_row"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM "validate_invoice_line_gst_evidence"(NEW."id"); RETURN NULL; END $$;
CREATE FUNCTION "validate_invoice_line_tax_component_parent"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM "validate_invoice_line_gst_evidence"(CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceLineGstEvidenceId" ELSE NEW."invoiceLineGstEvidenceId" END); RETURN NULL; END $$;
CREATE FUNCTION "validate_invoice_line_gst_from_line"() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE evidence_id uuid; BEGIN SELECT "id" INTO evidence_id FROM "InvoiceLineGstEvidence" WHERE "invoiceLineId" = NEW."id"; IF FOUND THEN PERFORM "validate_invoice_line_gst_evidence"(evidence_id); END IF; RETURN NULL; END $$;
CREATE FUNCTION "validate_invoice_line_gst_from_invoice"() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE evidence_id uuid; BEGIN FOR evidence_id IN SELECT line_evidence."id" FROM "InvoiceLineGstEvidence" line_evidence INNER JOIN "InvoiceLine" line ON line."id" = line_evidence."invoiceLineId" WHERE line."invoiceId" = NEW."id" LOOP PERFORM "validate_invoice_line_gst_evidence"(evidence_id); END LOOP; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER "InvoiceLineGstEvidence_components_check" AFTER INSERT OR UPDATE ON "InvoiceLineGstEvidence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_invoice_line_gst_evidence_row"();
CREATE CONSTRAINT TRIGGER "InvoiceLineTaxComponent_parent_check" AFTER INSERT OR UPDATE OR DELETE ON "InvoiceLineTaxComponent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_invoice_line_tax_component_parent"();
CREATE CONSTRAINT TRIGGER "InvoiceLine_gst_evidence_check" AFTER UPDATE ON "InvoiceLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_invoice_line_gst_from_line"();
CREATE CONSTRAINT TRIGGER "Invoice_gst_line_evidence_check" AFTER UPDATE ON "Invoice" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_invoice_line_gst_from_invoice"();

CREATE FUNCTION "protect_immutable_tax_evidence"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Persisted tax evidence is immutable';
END $$;
CREATE TRIGGER "PaymentTaxSnapshot_immutability" BEFORE UPDATE OR DELETE ON "PaymentTaxSnapshot" FOR EACH ROW EXECUTE FUNCTION "protect_immutable_tax_evidence"();
CREATE TRIGGER "PaymentTaxComponent_immutability" BEFORE UPDATE OR DELETE ON "PaymentTaxComponent" FOR EACH ROW EXECUTE FUNCTION "protect_immutable_tax_evidence"();
CREATE TRIGGER "InvoiceGstEvidence_immutability" BEFORE UPDATE OR DELETE ON "InvoiceGstEvidence" FOR EACH ROW EXECUTE FUNCTION "protect_immutable_tax_evidence"();
CREATE TRIGGER "InvoiceLineGstEvidence_immutability" BEFORE UPDATE OR DELETE ON "InvoiceLineGstEvidence" FOR EACH ROW EXECUTE FUNCTION "protect_immutable_tax_evidence"();
CREATE TRIGGER "InvoiceLineTaxComponent_immutability" BEFORE UPDATE OR DELETE ON "InvoiceLineTaxComponent" FOR EACH ROW EXECUTE FUNCTION "protect_immutable_tax_evidence"();

CREATE FUNCTION "protect_referenced_gst_policy"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentTaxSnapshot" WHERE "policyVersionId" = OLD."id") THEN RAISE EXCEPTION 'Referenced GST policy versions are immutable'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER "GstTaxPolicyVersion_immutability" BEFORE UPDATE OR DELETE ON "GstTaxPolicyVersion" FOR EACH ROW EXECUTE FUNCTION "protect_referenced_gst_policy"();
