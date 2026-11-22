/*
  Warnings:

  - A unique constraint covering the columns `[fileHash]` on the table `ComplianceDocument` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ComplianceDocument" ADD COLUMN     "fileHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_fileHash_key" ON "ComplianceDocument"("fileHash");
