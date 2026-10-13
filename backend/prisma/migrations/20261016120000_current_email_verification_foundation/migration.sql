ALTER TYPE "AccountActionTokenPurpose" ADD VALUE 'EMAIL_VERIFICATION';

ALTER TABLE "User"
  ADD COLUMN "emailRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verifiedEmail" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD CONSTRAINT "User_email_revision_check" CHECK ("emailRevision" >= 0),
  ADD CONSTRAINT "User_email_verification_consistency_check" CHECK (
    ("verifiedEmail" IS NULL AND "emailVerifiedAt" IS NULL) OR
    (
      "verifiedEmail" IS NOT NULL AND
      "emailVerifiedAt" IS NOT NULL AND
      "verifiedEmail" = LOWER(BTRIM("verifiedEmail")) AND
      "verifiedEmail" = LOWER(BTRIM("email"))
    )
  );

CREATE OR REPLACE FUNCTION "invalidate_user_email_verification"()
RETURNS TRIGGER AS $$
BEGIN
  IF LOWER(BTRIM(NEW."email")) IS DISTINCT FROM LOWER(BTRIM(OLD."email")) THEN
    NEW."emailRevision" := OLD."emailRevision" + 1;
    NEW."verifiedEmail" := NULL;
    NEW."emailVerifiedAt" := NULL;
  ELSE
    NEW."emailRevision" := OLD."emailRevision";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_email_verification_invalidation"
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_user_email_verification"();

ALTER TABLE "AccountActionToken"
  ADD COLUMN "targetEmail" TEXT,
  ADD COLUMN "emailRevision" INTEGER,
  ADD CONSTRAINT "AccountActionToken_email_verification_contract_check" CHECK (
    (
      "purpose"::TEXT = 'EMAIL_VERIFICATION' AND
      "targetEmail" IS NOT NULL AND
      "emailRevision" IS NOT NULL AND
      "emailRevision" >= 0 AND
      "targetEmail" = LOWER(BTRIM("targetEmail"))
    ) OR
    (
      "purpose"::TEXT <> 'EMAIL_VERIFICATION' AND
      "targetEmail" IS NULL AND
      "emailRevision" IS NULL
    )
  );

CREATE INDEX "AccountActionToken_userId_purpose_emailRevision_idx"
ON "AccountActionToken"("userId", "purpose", "emailRevision");
