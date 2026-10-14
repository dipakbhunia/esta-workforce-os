CREATE TABLE "RefreshSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RefreshToken"
  ADD COLUMN "sessionId" UUID;

CREATE UNIQUE INDEX "RefreshSession_id_userId_key"
  ON "RefreshSession"("id", "userId");

CREATE INDEX "RefreshSession_userId_idx"
  ON "RefreshSession"("userId");

CREATE INDEX "RefreshSession_expiresAt_idx"
  ON "RefreshSession"("expiresAt");

CREATE INDEX "RefreshToken_sessionId_idx"
  ON "RefreshToken"("sessionId");

ALTER TABLE "RefreshSession"
  ADD CONSTRAINT "RefreshSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_userId_fkey"
  FOREIGN KEY ("sessionId", "userId") REFERENCES "RefreshSession"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
