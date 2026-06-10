-- Preserve existing role IDs and assignments while evolving fixed roles into
-- customizable roles with an optional built-in system identity.
DROP INDEX "Role_companyId_name_key";
DROP INDEX "Role_name_idx";

ALTER TABLE "Role" RENAME COLUMN "name" TO "systemName";
ALTER TABLE "Role"
ADD COLUMN "key" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Role"
SET
  "key" = "systemName"::TEXT,
  "name" = INITCAP(REPLACE(LOWER("systemName"::TEXT), '_', ' '));

ALTER TABLE "Role"
ALTER COLUMN "key" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "RolePermission_permissionId_idx"
ON "RolePermission"("permissionId");

CREATE INDEX "Role_companyId_key_idx" ON "Role"("companyId", "key");
CREATE INDEX "Role_systemName_idx" ON "Role"("systemName");
CREATE INDEX "Role_deletedAt_idx" ON "Role"("deletedAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

CREATE UNIQUE INDEX "Role_active_tenant_key_key"
ON "Role"("companyId", "key")
WHERE "deletedAt" IS NULL AND "companyId" IS NOT NULL;

CREATE UNIQUE INDEX "Role_active_global_key_key"
ON "Role"("key")
WHERE "deletedAt" IS NULL AND "companyId" IS NULL;

CREATE UNIQUE INDEX "Role_active_tenant_systemName_key"
ON "Role"("companyId", "systemName")
WHERE "deletedAt" IS NULL
  AND "companyId" IS NOT NULL
  AND "systemName" IS NOT NULL;

CREATE UNIQUE INDEX "Role_active_global_systemName_key"
ON "Role"("systemName")
WHERE "deletedAt" IS NULL
  AND "companyId" IS NULL
  AND "systemName" IS NOT NULL;

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "Role"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
