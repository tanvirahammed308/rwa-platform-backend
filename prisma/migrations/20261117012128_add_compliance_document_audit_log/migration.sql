-- CreateTable
CREATE TABLE "ComplianceDocumentAuditLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocumentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceDocumentAuditLog_documentId_createdAt_idx" ON "ComplianceDocumentAuditLog"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceDocumentAuditLog_userId_idx" ON "ComplianceDocumentAuditLog"("userId");

-- AddForeignKey
ALTER TABLE "ComplianceDocumentAuditLog" ADD CONSTRAINT "ComplianceDocumentAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocumentAuditLog" ADD CONSTRAINT "ComplianceDocumentAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
