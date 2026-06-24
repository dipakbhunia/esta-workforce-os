/*
  Warnings:

  - You are about to drop the column `employeeId` on the `BreakPolicy` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "BreakPolicy" DROP CONSTRAINT "BreakPolicy_employeeId_fkey";

-- AlterTable
ALTER TABLE "BreakPolicy" DROP COLUMN "employeeId";
