-- PC-L: additive, hash-only account invitation and password recovery foundation.
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_RESET_REQUESTED';

CREATE TYPE "AccountActionTokenPurpose" AS ENUM ('INVITATION', 'PASSWORD_RESET');

CREATE TABLE "AccountActionToken" (
    "id" UUID NOT NULL,
    "purpose" "AccountActionTokenPurpose" NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountActionToken_lifecycle_check" CHECK (
      NOT ("consumedAt" IS NOT NULL AND "invalidatedAt" IS NOT NULL)
      AND "expiresAt" > "createdAt"
      AND ("consumedAt" IS NULL OR "consumedAt" >= "createdAt")
      AND ("invalidatedAt" IS NULL OR "invalidatedAt" >= "createdAt")
    )
);

CREATE TABLE "AccountActionRequestEvidence" (
    "id" UUID NOT NULL,
    "purpose" "AccountActionTokenPurpose" NOT NULL,
    "subjectHash" CHAR(64) NOT NULL,
    "ipHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActionRequestEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE INDEX "AccountActionToken_userId_purpose_createdAt_idx" ON "AccountActionToken"("userId", "purpose", "createdAt");
CREATE INDEX "AccountActionToken_purpose_expiresAt_idx" ON "AccountActionToken"("purpose", "expiresAt");
CREATE INDEX "AccountActionToken_companyId_purpose_idx" ON "AccountActionToken"("companyId", "purpose");
CREATE INDEX "AccountActionRequestEvidence_purpose_subjectHash_createdAt_idx" ON "AccountActionRequestEvidence"("purpose", "subjectHash", "createdAt");
CREATE INDEX "AccountActionRequestEvidence_purpose_ipHash_createdAt_idx" ON "AccountActionRequestEvidence"("purpose", "ipHash", "createdAt");

ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountActionToken" ADD CONSTRAINT "AccountActionToken_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validate_account_action_token_ownership"() RETURNS trigger AS $$
DECLARE owner_company UUID;
BEGIN
  SELECT "companyId" INTO owner_company FROM "User" WHERE "id" = NEW."userId";
  IF NOT FOUND OR owner_company IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Account action token owner scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AccountActionToken_ownership"
BEFORE INSERT OR UPDATE ON "AccountActionToken"
FOR EACH ROW EXECUTE FUNCTION "validate_account_action_token_ownership"();

CREATE FUNCTION "protect_account_action_token_evidence"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."purpose" <> OLD."purpose"
     OR NEW."userId" <> OLD."userId"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."tokenHash" <> OLD."tokenHash"
     OR NEW."expiresAt" <> OLD."expiresAt"
     OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt")
     OR (OLD."invalidatedAt" IS NOT NULL AND NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt") THEN
    RAISE EXCEPTION 'Account action token evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AccountActionToken_evidence_immutability"
BEFORE UPDATE ON "AccountActionToken"
FOR EACH ROW EXECUTE FUNCTION "protect_account_action_token_evidence"();

ALTER TABLE "Notification" ADD COLUMN "accountActionTokenId" UUID;
CREATE UNIQUE INDEX "Notification_accountActionTokenId_key" ON "Notification"("accountActionTokenId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_accountActionTokenId_fkey"
  FOREIGN KEY ("accountActionTokenId") REFERENCES "AccountActionToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
