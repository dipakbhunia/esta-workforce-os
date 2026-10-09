-- PC-M0: additive designated billing-contact authority for tenant commercial notifications.
ALTER TABLE "CompanyBillingProfile"
  ADD COLUMN "billingContactUserId" UUID;

CREATE UNIQUE INDEX "User_id_companyId_key"
  ON "User"("id", "companyId");

CREATE UNIQUE INDEX "CompanyBillingProfile_billingContactUserId_companyId_key"
  ON "CompanyBillingProfile"("billingContactUserId", "companyId");

ALTER TABLE "CompanyBillingProfile"
  ADD CONSTRAINT "CompanyBillingProfile_billingContactUserId_companyId_fkey"
  FOREIGN KEY ("billingContactUserId", "companyId")
  REFERENCES "User"("id", "companyId")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;
