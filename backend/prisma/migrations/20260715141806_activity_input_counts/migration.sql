-- AlterTable
ALTER TABLE "ActivitySession" ADD COLUMN     "keyboardCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mouseMoveCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scrollCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "mouseClickCount" SET DEFAULT 0;

UPDATE "ActivitySession"
SET
  "keyboardCount" = COALESCE("keystrokeCount", 0),
  "mouseClickCount" = COALESCE("mouseClickCount", 0);

ALTER TABLE "ActivitySession" ALTER COLUMN "mouseClickCount" SET NOT NULL;
