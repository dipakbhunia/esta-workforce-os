CREATE TYPE "EmailTemplateVersionLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TABLE "EmailTemplate" (
  "id" UUID NOT NULL,
  "templateKey" TEXT NOT NULL,
  "notificationType" "NotificationType" NOT NULL,
  "activeVersionId" UUID,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailTemplate_template_key_check" CHECK (
    LENGTH(BTRIM("templateKey")) BETWEEN 1 AND 120
    AND "templateKey" = BTRIM("templateKey")
    AND "templateKey" ~ '^[A-Z][A-Z0-9_]*$'
  ),
  CONSTRAINT "EmailTemplate_email_capable_type_check" CHECK ("notificationType" IN (
    'ALERT_OPENED', 'ALERT_REOPENED', 'ALERT_RESOLVED', 'ALERT_AUTO_RESOLVED',
    'PASSWORD_CHANGED', 'ACCOUNT_STATUS_CHANGED', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
    'LEAVE_APPLIED', 'LEAVE_CANCELLED', 'ATTENDANCE_CORRECTION_APPROVED',
    'ATTENDANCE_CORRECTION_REJECTED', 'ATTENDANCE_CORRECTION_APPLIED',
    'ACCOUNT_INVITATION', 'PASSWORD_RESET_REQUESTED', 'EMAIL_VERIFICATION',
    'PAYMENT_CAPTURED', 'PAYMENT_FAILED', 'INVOICE_ISSUED', 'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_EXPIRED', 'RENEWAL_APPLIED', 'RENEWAL_BLOCKED', 'RENEWAL_PREPARED'
  )),
  CONSTRAINT "EmailTemplate_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "EmailTemplateVersion" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "lifecycle" "EmailTemplateVersionLifecycle" NOT NULL DEFAULT 'DRAFT',
  "subjectTemplate" TEXT NOT NULL,
  "textBodyTemplate" TEXT NOT NULL,
  "placeholderContractVersion" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "validationResultCode" TEXT,
  "createdByUserId" UUID,
  "validatedByUserId" UUID,
  "publishedByUserId" UUID,
  "retiredByUserId" UUID,
  "validatedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailTemplateVersion_version_check" CHECK ("version" >= 1),
  CONSTRAINT "EmailTemplateVersion_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "EmailTemplateVersion_placeholder_contract_check" CHECK ("placeholderContractVersion" >= 1),
  CONSTRAINT "EmailTemplateVersion_content_check" CHECK (
    LENGTH(BTRIM("subjectTemplate")) BETWEEN 1 AND 998
    AND "subjectTemplate" !~ E'[\\r\\n]'
    AND LENGTH(BTRIM("textBodyTemplate")) BETWEEN 1 AND 100000
  ),
  CONSTRAINT "EmailTemplateVersion_validation_evidence_check" CHECK (
    ("validatedAt" IS NULL AND "validationResultCode" IS NULL AND "validatedByUserId" IS NULL)
    OR
    ("validatedAt" IS NOT NULL AND LENGTH(BTRIM("validationResultCode")) > 0)
  ),
  CONSTRAINT "EmailTemplateVersion_lifecycle_evidence_check" CHECK (
    (
      "lifecycle" = 'DRAFT'
      AND "publishedAt" IS NULL
      AND "publishedByUserId" IS NULL
      AND "retiredAt" IS NULL
      AND "retiredByUserId" IS NULL
    ) OR (
      "lifecycle" = 'PUBLISHED'
      AND "validatedAt" IS NOT NULL
      AND "validationResultCode" = 'VALID'
      AND "publishedAt" IS NOT NULL
      AND "retiredAt" IS NULL
      AND "retiredByUserId" IS NULL
    ) OR (
      "lifecycle" = 'RETIRED'
      AND "validatedAt" IS NOT NULL
      AND "validationResultCode" = 'VALID'
      AND "publishedAt" IS NOT NULL
      AND "retiredAt" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "EmailTemplate_templateKey_key" ON "EmailTemplate"("templateKey");
CREATE UNIQUE INDEX "EmailTemplate_notificationType_key" ON "EmailTemplate"("notificationType");
CREATE UNIQUE INDEX "EmailTemplate_id_activeVersionId_key" ON "EmailTemplate"("id", "activeVersionId");
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_version_key" ON "EmailTemplateVersion"("templateId", "version");
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_id_key" ON "EmailTemplateVersion"("templateId", "id");
CREATE INDEX "EmailTemplateVersion_templateId_lifecycle_createdAt_idx" ON "EmailTemplateVersion"("templateId", "lifecycle", "createdAt");
CREATE INDEX "EmailTemplateVersion_createdByUserId_idx" ON "EmailTemplateVersion"("createdByUserId");
CREATE INDEX "EmailTemplateVersion_validatedByUserId_idx" ON "EmailTemplateVersion"("validatedByUserId");
CREATE INDEX "EmailTemplateVersion_publishedByUserId_idx" ON "EmailTemplateVersion"("publishedByUserId");
CREATE INDEX "EmailTemplateVersion_retiredByUserId_idx" ON "EmailTemplateVersion"("retiredByUserId");

ALTER TABLE "EmailTemplateVersion"
  ADD CONSTRAINT "EmailTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmailTemplateVersion_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EmailTemplateVersion_validatedByUserId_fkey"
  FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EmailTemplateVersion_publishedByUserId_fkey"
  FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EmailTemplateVersion_retiredByUserId_fkey"
  FOREIGN KEY ("retiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_active_version_fkey"
  FOREIGN KEY ("id", "activeVersionId")
  REFERENCES "EmailTemplateVersion"("templateId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD COLUMN "emailTemplateVersionId" UUID,
  ADD COLUMN "emailCompositionVersion" TEXT,
  ADD CONSTRAINT "Notification_email_template_provenance_check" CHECK (
    "emailTemplateVersionId" IS NULL OR (
      LENGTH(BTRIM("emailCompositionVersion")) BETWEEN 1 AND 120
      AND "emailCompositionVersion" = BTRIM("emailCompositionVersion")
    )
  );

CREATE INDEX "Notification_emailTemplateVersionId_idx" ON "Notification"("emailTemplateVersionId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_emailTemplateVersionId_fkey"
  FOREIGN KEY ("emailTemplateVersionId") REFERENCES "EmailTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "allocate_email_template_version"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."templateId"::text, 58001));
  SELECT COALESCE(MAX("version"), 0) + 1
    INTO NEW."version"
    FROM "EmailTemplateVersion"
    WHERE "templateId" = NEW."templateId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailTemplateVersion_allocate_version"
BEFORE INSERT ON "EmailTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "allocate_email_template_version"();

CREATE FUNCTION "enforce_email_template_version_actor_evidence"() RETURNS trigger AS $$
BEGIN
  IF NEW."validatedAt" IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD."validatedAt" IS NULL)
    AND NEW."validatedByUserId" IS NULL THEN
    RAISE EXCEPTION 'Email template validation requires an actor' USING ERRCODE = '23514';
  END IF;
  IF NEW."lifecycle" = 'PUBLISHED'
    AND (TG_OP = 'INSERT' OR OLD."lifecycle" <> 'PUBLISHED')
    AND NEW."publishedByUserId" IS NULL THEN
    RAISE EXCEPTION 'Email template publication requires an actor' USING ERRCODE = '23514';
  END IF;
  IF NEW."lifecycle" = 'RETIRED'
    AND (TG_OP = 'INSERT' OR OLD."lifecycle" <> 'RETIRED')
    AND NEW."retiredByUserId" IS NULL THEN
    RAISE EXCEPTION 'Email template retirement requires an actor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailTemplateVersion_actor_evidence_guard"
BEFORE INSERT OR UPDATE ON "EmailTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "enforce_email_template_version_actor_evidence"();

CREATE FUNCTION "enforce_email_template_version_history"() RETURNS trigger AS $$
BEGIN
  IF OLD."lifecycle" = 'DRAFT' AND NEW."lifecycle" NOT IN ('DRAFT', 'PUBLISHED') THEN
    RAISE EXCEPTION 'Draft email template versions may only remain draft or be published' USING ERRCODE = '23514';
  END IF;
  IF OLD."lifecycle" = 'PUBLISHED' AND NEW."lifecycle" NOT IN ('PUBLISHED', 'RETIRED') THEN
    RAISE EXCEPTION 'Published email template versions may only remain published or be retired' USING ERRCODE = '23514';
  END IF;
  IF OLD."lifecycle" = 'RETIRED' AND NEW."lifecycle" <> 'RETIRED' THEN
    RAISE EXCEPTION 'Retired email template versions cannot change lifecycle' USING ERRCODE = '23514';
  END IF;
  IF NEW."lifecycle" <> 'PUBLISHED' AND EXISTS (
    SELECT 1 FROM "EmailTemplate" WHERE "activeVersionId" = OLD."id"
  ) THEN
    RAISE EXCEPTION 'An active email template version cannot be retired or reverted' USING ERRCODE = '23514';
  END IF;

  IF OLD."lifecycle" IN ('PUBLISHED', 'RETIRED') AND (
    NEW."templateId" IS DISTINCT FROM OLD."templateId" OR
    NEW."version" IS DISTINCT FROM OLD."version" OR
    NEW."subjectTemplate" IS DISTINCT FROM OLD."subjectTemplate" OR
    NEW."textBodyTemplate" IS DISTINCT FROM OLD."textBodyTemplate" OR
    NEW."placeholderContractVersion" IS DISTINCT FROM OLD."placeholderContractVersion" OR
    NEW."validationResultCode" IS DISTINCT FROM OLD."validationResultCode" OR
    NEW."validatedAt" IS DISTINCT FROM OLD."validatedAt" OR
    NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
  ) THEN
    RAISE EXCEPTION 'Published email template content and validation evidence are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailTemplateVersion_history_guard"
BEFORE UPDATE ON "EmailTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "enforce_email_template_version_history"();

CREATE FUNCTION "protect_email_template_version_history"() RETURNS trigger AS $$
BEGIN
  IF OLD."lifecycle" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Published or retired email template versions cannot be deleted' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailTemplateVersion_delete_guard"
BEFORE DELETE ON "EmailTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION "protect_email_template_version_history"();

CREATE FUNCTION "enforce_email_template_active_version"() RETURNS trigger AS $$
BEGIN
  IF NEW."activeVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "EmailTemplateVersion"
    WHERE "id" = NEW."activeVersionId"
      AND "templateId" = NEW."id"
      AND "lifecycle" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Active email template version must be a published version of the same template' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EmailTemplate_active_version_guard"
BEFORE INSERT OR UPDATE OF "activeVersionId" ON "EmailTemplate"
FOR EACH ROW EXECUTE FUNCTION "enforce_email_template_active_version"();
