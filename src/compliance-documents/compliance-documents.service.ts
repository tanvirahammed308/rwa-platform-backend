
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';


@Injectable()
export class ComplianceDocumentsService {
  constructor(private prisma: PrismaService) {}



async create(
  complianceCaseId: string,
  uploadedById: string,
  role: string,
  dto: {
    documentType: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
  },
) {
  // Step 1: Check user role
  if (!['ISSUER', 'ADMIN'].includes(role)) {
    throw new ForbiddenException(
      'You are not allowed to create compliance documents',
    );
  }

  // Step 2: Find compliance case
  const complianceCase =
    await this.prisma.complianceCase.findUnique({
      where: { id: complianceCaseId },
    });

  if (!complianceCase) {
    throw new NotFoundException('Compliance case not found');
  }

  // Step 3: Check ISSUER ownership
  if (
    role === 'ISSUER' &&
    complianceCase.submittedById !== uploadedById
  ) {
    throw new ForbiddenException(
      'You are not allowed to create documents for this compliance case',
    );
  }

  // Step 4: Only pending cases accept documents
  if (complianceCase.status !== 'PENDING') {
    throw new BadRequestException(
      'Documents can only be uploaded to pending compliance cases',
    );
  }

  // Step 5: Create metadata-only document
  const document = await this.prisma.complianceDocument.create({
    data: {
      complianceCaseId,
      uploadedById,
      documentType: dto.documentType,
      fileName: dto.fileName,
      fileUrl: null,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
    },
  });

  // Step 6: Return response
  return {
    message: 'Compliance document created successfully',
    data: document,
  };
}




async findAll(
  complianceCaseId: string,
  userId: string,
  role: string,
) {
  // Step 1: Check user role
  if (!['ISSUER', 'ADMIN', 'COMPLIANCE_OFFICER'].includes(role)) {
    throw new ForbiddenException(
      'You are not allowed to view compliance documents',
    );
  }

  // Step 2: Find compliance case
  const complianceCase =
    await this.prisma.complianceCase.findUnique({
      where: { id: complianceCaseId },
    });

  if (!complianceCase) {
    throw new NotFoundException('Compliance case not found');
  }

  // Step 3: Check ISSUER ownership
  if (
    role === 'ISSUER' &&
    complianceCase.submittedById !== userId
  ) {
    throw new NotFoundException('Compliance case not found');
  }

  // Step 4: Find all documents
  const documents =
    await this.prisma.complianceDocument.findMany({
      where: { complianceCaseId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  // Step 5: Return response
  return {
    message: 'Compliance documents retrieved successfully',
    data: documents,
  };
}



async review(
  documentId: string,
  reviewerId: string,
  role: string,
  dto: {
    status: string;
    reviewNotes?: string;
  },
) {
  // Step 1: Check reviewer role
  if (!['ADMIN', 'COMPLIANCE_OFFICER'].includes(role)) {
    throw new ForbiddenException(
      'You are not allowed to review documents',
    );
  }

  // Step 2: Start database transaction
  return this.prisma.$transaction(async (tx) => {
    // Step 3: Find document
    const document =
      await tx.complianceDocument.findUnique({
        where: { id: documentId },
      });

    if (!document) {
      throw new NotFoundException(
        'Compliance document not found',
      );
    }

    // Step 4: Check document status
    if (document.status !== 'PENDING') {
      throw new BadRequestException(
        'This document has already been reviewed',
      );
    }

    // Step 5: Update document
    const updatedDocument =
      await tx.complianceDocument.update({
        where: { id: documentId },
        data: {
          status: dto.status,
          reviewNotes: dto.reviewNotes,
          reviewerId,
          reviewedAt: new Date(),
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

    // Step 6: Create audit log
    await tx.complianceDocumentAuditLog.create({
      data: {
        documentId,
        userId: reviewerId,
        action: `COMPLIANCE_DOCUMENT_${dto.status}`,
        oldStatus: document.status,
        newStatus: dto.status,
        reviewNotes: dto.reviewNotes,
      },
    });

    // Step 7: Return response
    return {
      message: `Compliance document ${dto.status.toLowerCase()} successfully`,
      data: updatedDocument,
    };
  });
}

async getAuditLogs(
  documentId: string,
  userId: string,
  role: string,
) {
  // Step 1: Find document
  const document =
    await this.prisma.complianceDocument.findUnique({
      where: { id: documentId },
      include: {
        complianceCase: true,
      },
    });

  if (!document) {
    throw new NotFoundException(
      'Compliance document not found',
    );
  }

  // Step 2: Check issuer ownership
  if (
    role === 'ISSUER' &&
    document.complianceCase.submittedById !== userId
  ) {
    throw new NotFoundException(
      'Compliance document not found',
    );
  }

  // Step 3: Retrieve audit logs
  const auditLogs =
    await this.prisma.complianceDocumentAuditLog.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  return {
    message: 'Compliance document audit logs retrieved successfully',
    data: auditLogs,
  };
}



async uploadFile(
  complianceCaseId: string,
  uploadedById: string,
  role: string,
  file: Express.Multer.File,
) {
  // Step 1: Check uploaded file
  if (!file) {
    throw new BadRequestException('PDF file is required');
  }

  // Step 2: Check user role
  if (!['ISSUER', 'ADMIN'].includes(role)) {
    throw new ForbiddenException(
      'You are not allowed to upload compliance documents',
    );
  }

  // Step 3: Find compliance case
  const complianceCase =
    await this.prisma.complianceCase.findUnique({
      where: { id: complianceCaseId },
    });

  if (!complianceCase) {
    throw new NotFoundException('Compliance case not found');
  }

  // Step 4: Check ISSUER ownership
  if (
    role === 'ISSUER' &&
    complianceCase.submittedById !== uploadedById
  ) {
    throw new ForbiddenException(
      'You are not allowed to upload documents to this compliance case',
    );
  }

  // Step 5: Only pending cases accept documents
  if (complianceCase.status !== 'PENDING') {
    throw new BadRequestException(
      'Documents can only be uploaded to pending compliance cases',
    );
  }

  // Step 6: Save file metadata in database
  const document = await this.prisma.complianceDocument.create({
    data: {
      complianceCaseId,
      uploadedById,
      documentType: 'COMPLIANCE',
      fileName: file.originalname,
      fileUrl: `/uploads/${file.filename}`,
      mimeType: file.mimetype,
      fileSize: file.size,
    },
  });

  // Step 7: Return response
  return {
    message: 'Compliance document uploaded successfully',
    data: document,
  };
}


async getDownloadInfo(
  documentId: string,
  userId: string,
  role: string,
) {
  const document =
    await this.prisma.complianceDocument.findUnique({
      where: { id: documentId },
      include: {
        complianceCase: true,
      },
    });

  if (!document) {
    throw new NotFoundException(
      'Compliance document not found',
    );
  }

  // ISSUER can only access documents
  // belonging to their own compliance cases.
  if (
    role === 'ISSUER' &&
    document.complianceCase.submittedById !== userId
  ) {
    throw new ForbiddenException(
      'You are not allowed to download this document',
    );
  }

  // Only these roles are allowed.
  if (
    !['ISSUER', 'ADMIN', 'COMPLIANCE_OFFICER'].includes(role)
  ) {
    throw new ForbiddenException(
      'You are not allowed to download this document',
    );
  }

  return {
    fileName: document.fileName,
    fileUrl: document.fileUrl,
  };
}
}



