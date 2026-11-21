
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateComplianceCaseDto } from './dto/create-compliance-case.dto.js';

import { ReviewComplianceCaseDto } from './dto/review-compliance-case.dto.js';

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =====================================
  // 1. CREATE COMPLIANCE CASE
  // =====================================

  async create(
    dto: CreateComplianceCaseDto,
    userId: string,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: dto.assetId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!asset) {
      throw new NotFoundException(
        'Active asset not found',
      );
    }

    const complianceCase =
      await this.prisma.complianceCase.create({
        data: {
          assetId: dto.assetId,
          submittedById: userId,
          reason: dto.reason,
        },
      });

    return {
      message: 'Compliance case created successfully',
      data: complianceCase,
    };
  }

  // =====================================
  // 2. GET ALL COMPLIANCE CASES (RBAC)
  // =====================================

  async findAll(
    userId: string,
    role: string,
  ) {
    // Step 1: Validate user role
    if (
      !['ISSUER', 'COMPLIANCE_OFFICER', 'ADMIN'].includes(role)
    ) {
      throw new ForbiddenException(
        'You do not have permission to access compliance cases',
      );
    }

    // Step 2: ISSUER can access only own cases
    const where =
      role === 'ISSUER'
        ? { submittedById: userId }
        : {};

    // Step 3: Get compliance cases
    const complianceCases =
      await this.prisma.complianceCase.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              symbol: true,
              status: true,
            },
          },
          submittedBy: {
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

    return {
      message: 'Compliance cases retrieved successfully',
      data: complianceCases,
    };
  }

  // =====================================
  // 3. GET SINGLE COMPLIANCE CASE (RBAC)
  // =====================================

  async findOne(
    id: string,
    userId: string,
    role: string,
  ) {
    // Step 1: Validate role
    if (
      !['ISSUER', 'COMPLIANCE_OFFICER', 'ADMIN'].includes(role)
    ) {
      throw new ForbiddenException(
        'You do not have permission to access compliance cases',
      );
    }

    // Step 2: Find compliance case
    const complianceCase =
      await this.prisma.complianceCase.findUnique({
        where: {
          id,
        },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              symbol: true,
              assetType: true,
              description: true,
              totalSupply: true,
              status: true,
            },
          },
          submittedBy: {
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
          auditLogs: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

    // Step 3: Check existence
    if (!complianceCase) {
      throw new NotFoundException(
        'Compliance case not found',
      );
    }

    // Step 4: Check ISSUER ownership
    if (
      role === 'ISSUER' &&
      complianceCase.submittedById !== userId
    ) {
      throw new NotFoundException(
        'Compliance case not found',
      );
    }

    // Step 5: Return response
    return {
      message: 'Compliance case retrieved successfully',
      data: complianceCase,
    };
  }

  // =====================================
  // 4. REVIEW COMPLIANCE CASE
  // =====================================

  async review(
    id: string,
    dto: ReviewComplianceCaseDto,
    reviewerId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {

      // Step 1: Find compliance case
      const complianceCase =
        await tx.complianceCase.findUnique({
          where: {
            id,
          },
        });

      if (!complianceCase) {
        throw new NotFoundException(
          'Compliance case not found',
        );
      }

      // Step 2: Check current status
      if (complianceCase.status !== 'PENDING') {
        throw new BadRequestException(
          'Only PENDING compliance cases can be reviewed',
        );
      }

      // Step 3: Update compliance case
      const updatedCase =
        await tx.complianceCase.update({
          where: {
            id,
          },
          data: {
            status: dto.status,
            reviewerId,
            reviewNotes: dto.reviewNotes ?? null,
            reviewedAt: new Date(),
          },
          include: {
            asset: {
              select: {
                id: true,
                name: true,
                symbol: true,
                status: true,
              },
            },
            submittedBy: {
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

      // Step 4: Create compliance audit log
      const auditLog =
        await tx.complianceAuditLog.create({
          data: {
            complianceCaseId: id,
            userId: reviewerId,
            action: `COMPLIANCE_CASE_${dto.status}`,
            oldStatus: complianceCase.status,
            newStatus: dto.status,
            reviewNotes: dto.reviewNotes ?? null,
          },
        });

      // Step 5: Return response
      return {
        message: `Compliance case ${dto.status.toLowerCase()} successfully`,
        data: updatedCase,
        auditLog,
      };
    });
  }

  // =====================================
  // 5. GET COMPLIANCE CASE AUDIT LOGS (RBAC)
  // =====================================

  async findAuditLogs(
    id: string,
    userId: string,
    role: string,
  ) {
    // Step 1: Validate user role
    if (
      !['ISSUER', 'COMPLIANCE_OFFICER', 'ADMIN'].includes(role)
    ) {
      throw new ForbiddenException(
        'You do not have permission to access audit logs',
      );
    }

    // Step 2: Find compliance case
    const complianceCase =
      await this.prisma.complianceCase.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          submittedById: true,
        },
      });

    if (!complianceCase) {
      throw new NotFoundException(
        'Compliance case not found',
      );
    }

    // Step 3: Check ISSUER ownership
    if (
      role === 'ISSUER' &&
      complianceCase.submittedById !== userId
    ) {
      throw new NotFoundException(
        'Compliance case not found',
      );
    }

    // Step 4: Get audit logs
    const auditLogs =
      await this.prisma.complianceAuditLog.findMany({
        where: {
          complianceCaseId: id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

    // Step 5: Return response
    return {
      message: 'Compliance audit logs retrieved successfully',
      data: auditLogs,
    };
  }

// DASHBOARD
async getDashboard() {
  const [
    totalCases,
    pendingCases,
    approvedCases,
    rejectedCases,
    recentActivities,
  ] = await Promise.all([
    this.prisma.complianceCase.count(),

    this.prisma.complianceCase.count({
      where: { status: 'PENDING' },
    }),

    this.prisma.complianceCase.count({
      where: { status: 'APPROVED' },
    }),

    this.prisma.complianceCase.count({
      where: { status: 'REJECTED' },
    }),

    this.prisma.complianceAuditLog.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        complianceCase: {
          select: {
            id: true,
            status: true,
            asset: {
              select: {
                id: true,
                name: true,
                symbol: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    message: 'Compliance dashboard retrieved successfully',
    data: {
      statistics: {
        totalCases,
        pendingCases,
        approvedCases,
        rejectedCases,
      },
      recentActivities,
    },
  };
}

}
