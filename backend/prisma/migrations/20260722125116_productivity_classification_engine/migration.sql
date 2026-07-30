-- CreateEnum
CREATE TYPE "ProductivityCategory" AS ENUM ('PRODUCTIVE', 'NEUTRAL', 'UNPRODUCTIVE', 'UNCLASSIFIED');

-- CreateTable
CREATE TABLE "ApplicationProductivityRule" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "applicationName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" "ProductivityCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationProductivityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteProductivityRule" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "hostname" TEXT NOT NULL,
    "normalizedHostname" TEXT NOT NULL,
    "category" "ProductivityCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WebsiteProductivityRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationProductivityRule_companyId_idx" ON "ApplicationProductivityRule"("companyId");

-- CreateIndex
CREATE INDEX "ApplicationProductivityRule_category_idx" ON "ApplicationProductivityRule"("category");

-- CreateIndex
CREATE INDEX "ApplicationProductivityRule_enabled_idx" ON "ApplicationProductivityRule"("enabled");

-- CreateIndex
CREATE INDEX "ApplicationProductivityRule_deletedAt_idx" ON "ApplicationProductivityRule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationProductivityRule_scope_normalizedName_key" ON "ApplicationProductivityRule"("scope", "normalizedName");

-- CreateIndex
CREATE INDEX "WebsiteProductivityRule_companyId_idx" ON "WebsiteProductivityRule"("companyId");

-- CreateIndex
CREATE INDEX "WebsiteProductivityRule_category_idx" ON "WebsiteProductivityRule"("category");

-- CreateIndex
CREATE INDEX "WebsiteProductivityRule_enabled_idx" ON "WebsiteProductivityRule"("enabled");

-- CreateIndex
CREATE INDEX "WebsiteProductivityRule_deletedAt_idx" ON "WebsiteProductivityRule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteProductivityRule_scope_normalizedHostname_key" ON "WebsiteProductivityRule"("scope", "normalizedHostname");

-- AddForeignKey
ALTER TABLE "ApplicationProductivityRule" ADD CONSTRAINT "ApplicationProductivityRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteProductivityRule" ADD CONSTRAINT "WebsiteProductivityRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
