ALTER TABLE "NotificationDelivery"
ADD COLUMN "claimToken" UUID,
ADD COLUMN "claimExpiresAt" TIMESTAMP(3);

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_claim_consistency_check"
CHECK (
  ("claimToken" IS NULL AND "claimExpiresAt" IS NULL)
  OR
  ("claimToken" IS NOT NULL AND "claimExpiresAt" IS NOT NULL)
);

CREATE INDEX "NotificationDelivery_dispatch_eligibility_idx"
ON "NotificationDelivery"("channel", "status", "nextRetryAt", "claimExpiresAt", "createdAt", "id");

CREATE INDEX "NotificationDelivery_email_log_order_idx"
ON "NotificationDelivery"("channel", "status", "createdAt", "id");
