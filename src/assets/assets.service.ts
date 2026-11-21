import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto.js';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // 1. GET ALL ACTIVE ASSETS
  // GET /api/assets
  // ==========================================

  async findAll() {
    return this.prisma.asset.findMany({
      where: {
        archivedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==========================================
  // 2. CREATE ASSET + AUDIT LOG
  // POST /api/assets
  // ==========================================

  async create(
    createAssetDto: CreateAssetDto,
    ownerId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Create asset
        const asset = await tx.asset.create({
          data: {
            name: createAssetDto.name,
            symbol: createAssetDto.symbol,
            assetType: createAssetDto.assetType,
            description: createAssetDto.description,
            totalSupply: createAssetDto.totalSupply ?? 0,
            ownerId,
          },
        });

        // Step 2: Create audit log
        await tx.auditLog.create({
          data: {
            assetId: asset.id,
            userId: ownerId,
            action: 'ASSET_CREATED',
            oldStatus: 'NONE',
            newStatus: asset.status,
          },
        });

        // Step 3: Return response
        return {
          message: 'Asset created successfully',
          data: asset,
        };
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Asset symbol already exists',
        );
      }

      throw error;
    }
  }

  // ==========================================
  // 3. UPDATE ASSET + FIELD-LEVEL AUDIT LOG
  // PATCH /api/assets/:id
  // ==========================================

  async update(
    id: string,
    updateAssetDto: UpdateAssetDto,
    userId: string,
    role: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Find existing asset
        const existingAsset = await tx.asset.findUnique({
          where: { id },
        });

        if (!existingAsset) {
          throw new NotFoundException('Asset not found');
        }

        // Step 2: Prevent updating archived assets
        if (existingAsset.archivedAt !== null) {
          throw new BadRequestException(
            'Archived assets cannot be modified',
          );
        }

        // Step 3: Check ownership
        if (
          role !== 'ADMIN' &&
          existingAsset.ownerId !== userId
        ) {
          throw new ForbiddenException(
            'You can only update your own assets',
          );
        }

        // Step 4: Only DRAFT assets can be edited
        if (existingAsset.status !== 'DRAFT') {
          throw new BadRequestException(
            'Only DRAFT assets can be edited',
          );
        }

        // Step 5: Fields allowed to update
        const fieldsToCheck = [
          'name',
          'symbol',
          'assetType',
          'description',
          'totalSupply',
        ] as const;

        // Step 6: Check whether any value has changed
        const hasChanges = fieldsToCheck.some((field) => {
          const incomingValue = updateAssetDto[field];

          if (incomingValue === undefined) {
            return false;
          }

          const currentValue = existingAsset[field];

          const oldValue =
            currentValue == null
              ? null
              : String(currentValue);

          const newValue =
            incomingValue == null
              ? null
              : String(incomingValue);

          return oldValue !== newValue;
        });

        // Step 7: No changes detected
        if (!hasChanges) {
          return {
            message: 'No changes detected',
            data: existingAsset,
          };
        }

        // Step 8: Update asset
        const result = await tx.asset.updateMany({
          where: {
            id,
            status: 'DRAFT',
            archivedAt: null,
            updatedAt: existingAsset.updatedAt,
            ...(role !== 'ADMIN'
              ? { ownerId: userId }
              : {}),
          },
          data: {
            name: updateAssetDto.name,
            symbol: updateAssetDto.symbol,
            assetType: updateAssetDto.assetType,
            description: updateAssetDto.description,
            totalSupply: updateAssetDto.totalSupply,
          },
        });

        // Step 9: Detect concurrent changes
        if (result.count === 0) {
          throw new ConflictException(
            'Asset status, ownership, or data changed. Please try again',
          );
        }

        // Step 10: Fetch updated asset
        const updatedAsset = await tx.asset.findUnique({
          where: { id },
        });

        if (!updatedAsset) {
          throw new NotFoundException('Asset not found');
        }

        // Step 11: Build field-level changes
        const changes: Record<
          string,
          { old: string | null; new: string | null }
        > = {};

        for (const field of fieldsToCheck) {
          const oldValue =
            existingAsset[field] == null
              ? null
              : String(existingAsset[field]);

          const newValue =
            updatedAsset[field] == null
              ? null
              : String(updatedAsset[field]);

          if (oldValue !== newValue) {
            changes[field] = {
              old: oldValue,
              new: newValue,
            };
          }
        }

        // Step 12: Save audit log
        if (Object.keys(changes).length > 0) {
          await tx.auditLog.create({
            data: {
              assetId: id,
              userId,
              action: 'ASSET_UPDATED',
              oldStatus: existingAsset.status,
              newStatus: updatedAsset.status,
              changes,
            },
          });
        }

        // Step 13: Return response
        return {
          message: 'Asset updated successfully',
          data: updatedAsset,
        };
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Asset symbol already exists',
        );
      }

      throw error;
    }
  }

  // ==========================================
  // 4. SOFT DELETE / ARCHIVE ASSET
  // DELETE /api/assets/:id
  // ==========================================

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Find asset
      const asset = await tx.asset.findUnique({
        where: { id },
      });

      if (!asset) {
        throw new NotFoundException('Asset not found');
      }

      // Step 2: Prevent duplicate archiving
      if (asset.archivedAt !== null) {
        throw new BadRequestException(
          'Asset is already archived',
        );
      }

      // Step 3: Archive asset
      const archivedAt = new Date();

      const result = await tx.asset.updateMany({
        where: {
          id,
          archivedAt: null,
          updatedAt: asset.updatedAt,
        },
        data: {
          archivedAt,
        },
      });

      // Step 4: Check concurrent changes
      if (result.count === 0) {
        throw new ConflictException(
          'Asset changed. Please try again',
        );
      }

      // Step 5: Save audit log
      await tx.auditLog.create({
        data: {
          assetId: id,
          userId,
          action: 'ASSET_ARCHIVED',
          oldStatus: asset.status,
          newStatus: asset.status,
          changes: {
            archivedAt: {
              old: null,
              new: archivedAt.toISOString(),
            },
          },
        },
      });

      // Step 6: Fetch archived asset
      const archivedAsset = await tx.asset.findUnique({
        where: { id },
      });

      return {
        message: 'Asset archived successfully',
        data: archivedAsset,
      };
    });
  }

  // ==========================================
  // 5. APPROVE / REJECT ASSET
  // PATCH /api/assets/:id/status
  // ==========================================

  async updateStatus(
    id: string,
    updateAssetStatusDto: UpdateAssetStatusDto,
    userId: string,
  ) {
    // Step 1: Validate requested status
    const newStatus = updateAssetStatusDto.status;

    if (
      newStatus !== 'APPROVED' &&
      newStatus !== 'REJECTED'
    ) {
      throw new BadRequestException(
        'Status must be APPROVED or REJECTED',
      );
    }

    // Step 2: Find asset
    const asset = await this.prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Step 3: Prevent modifying archived assets
    if (asset.archivedAt !== null) {
      throw new BadRequestException(
        'Archived assets cannot be modified',
      );
    }

    // Step 4: Validate current status
    if (asset.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(
        'Only PENDING_REVIEW assets can be approved or rejected',
      );
    }

    // Step 5: Update status and create audit log
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.updateMany({
        where: {
          id,
          status: 'PENDING_REVIEW',
          archivedAt: null,
        },
        data: {
          status: newStatus,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Asset status or archive state changed. Please try again',
        );
      }

      // Step 6: Save audit log
      await tx.auditLog.create({
        data: {
          assetId: id,
          userId,
          action:
            newStatus === 'APPROVED'
              ? 'ASSET_APPROVED'
              : 'ASSET_REJECTED',
          oldStatus: 'PENDING_REVIEW',
          newStatus,
        },
      });

      // Step 7: Fetch updated asset
      const updatedAsset = await tx.asset.findUnique({
        where: { id },
      });

      return {
        message: 'Asset status updated successfully',
        data: updatedAsset,
      };
    });
  }

  // ==========================================
  // 6. SUBMIT ASSET FOR REVIEW
  // PATCH /api/assets/:id/submit-for-review
  // ==========================================

  async submitForReview(
    id: string,
    userId: string,
    role: string,
  ) {
    // Step 1: Find asset
    const asset = await this.prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Step 2: Prevent modifying archived assets
    if (asset.archivedAt !== null) {
      throw new BadRequestException(
        'Archived assets cannot be modified',
      );
    }

    // Step 3: Check ownership
    if (
      role !== 'ADMIN' &&
      asset.ownerId !== userId
    ) {
      throw new ForbiddenException(
        'You can only submit your own assets for review',
      );
    }

    // Step 4: Validate current status
    if (asset.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT assets can be submitted for review',
      );
    }

    // Step 5: Update status in transaction
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.asset.updateMany({
        where: {
          id,
          status: 'DRAFT',
          archivedAt: null,
          ...(role !== 'ADMIN'
            ? { ownerId: userId }
            : {}),
        },
        data: {
          status: 'PENDING_REVIEW',
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Asset status, ownership, or archive state changed. Please try again',
        );
      }

      // Step 6: Save audit log
      await tx.auditLog.create({
        data: {
          assetId: id,
          userId,
          action: 'ASSET_SUBMITTED_FOR_REVIEW',
          oldStatus: 'DRAFT',
          newStatus: 'PENDING_REVIEW',
        },
      });

      // Step 7: Fetch updated asset
      const updatedAsset = await tx.asset.findUnique({
        where: { id },
      });

      return {
        message: 'Asset submitted for review successfully',
        data: updatedAsset,
      };
    });
  }

  // ==========================================
  // 7. GET ASSET AUDIT HISTORY
  // GET /api/assets/:id/audit-logs
  // ==========================================

  async getAuditLogs(assetId: string) {
    // Step 1: Check asset exists
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Step 2: Fetch audit logs
    const logs = await this.prisma.auditLog.findMany({
      where: {
        assetId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        action: true,
        oldStatus: true,
        newStatus: true,
        changes: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Step 3: Return audit history
    return {
      message: 'Asset audit history fetched successfully',
      assetId,
      data: logs,
    };
  }

  // ==========================================
  // 8. GET ALL ARCHIVED ASSETS
  // GET /api/assets/archived
  // ==========================================

  async findArchived() {
    return this.prisma.asset.findMany({
      where: {
        archivedAt: {
          not: null,
        },
      },
      orderBy: {
        archivedAt: 'desc',
      },
    });
  }

  // ==========================================
  // 9. RESTORE ARCHIVED ASSET
  // PATCH /api/assets/:id/restore
  // ==========================================

  async restore(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: Find asset
      const asset = await tx.asset.findUnique({
        where: { id },
      });

      if (!asset) {
        throw new NotFoundException('Asset not found');
      }

      // Step 2: Make sure the asset is archived
      if (asset.archivedAt === null) {
        throw new BadRequestException(
          'Asset is not archived',
        );
      }

      // Step 3: Restore asset
      const result = await tx.asset.updateMany({
        where: {
          id,
          archivedAt: asset.archivedAt,
        },
        data: {
          archivedAt: null,
        },
      });

      // Step 4: Check concurrent changes
      if (result.count === 0) {
        throw new ConflictException(
          'Asset state changed. Please try again',
        );
      }

      // Step 5: Save audit log
      await tx.auditLog.create({
        data: {
          assetId: id,
          userId,
          action: 'ASSET_RESTORED',
          oldStatus: asset.status,
          newStatus: asset.status,
          changes: {
            archivedAt: {
              old: asset.archivedAt.toISOString(),
              new: null,
            },
          },
        },
      });

      // Step 6: Fetch restored asset
      const restoredAsset = await tx.asset.findUnique({
        where: { id },
      });

      return {
        message: 'Asset restored successfully',
        data: restoredAsset,
      };
    });
  }
}