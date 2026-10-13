ALTER TABLE "PlatformEmailSettings"
  ADD COLUMN "databaseAuthorityEstablishedAt" TIMESTAMP(3);

ALTER TABLE "PlatformEmailSettings"
  ADD CONSTRAINT "PlatformEmailSettings_authority_state_check" CHECK (
    (
      "databaseAuthorityEstablishedAt" IS NULL
      AND "enabled" = FALSE
      AND "activeConfigurationVersionId" IS NULL
    ) OR (
      "databaseAuthorityEstablishedAt" IS NOT NULL
      AND "activeConfigurationVersionId" IS NOT NULL
    )
  );

CREATE FUNCTION "enforce_platform_email_authority_permanence"() RETURNS trigger AS $$
BEGIN
  IF OLD."databaseAuthorityEstablishedAt" IS NOT NULL
    AND NEW."databaseAuthorityEstablishedAt" IS DISTINCT FROM OLD."databaseAuthorityEstablishedAt" THEN
    RAISE EXCEPTION 'Database SMTP authority cannot be cleared or replaced' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformEmailSettings_authority_permanence_guard"
BEFORE UPDATE OF "databaseAuthorityEstablishedAt" ON "PlatformEmailSettings"
FOR EACH ROW EXECUTE FUNCTION "enforce_platform_email_authority_permanence"();
