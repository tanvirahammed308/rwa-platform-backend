
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto.js';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  
async create(createAssetDto: CreateAssetDto) {
  try {
    const asset = await this.prisma.asset.create({
      data: {
        name: createAssetDto.name,
        symbol: createAssetDto.symbol,
        assetType: createAssetDto.assetType,
        description: createAssetDto.description,
        totalSupply: createAssetDto.totalSupply ?? 0,
      },
    });

    return {
      message: 'Asset created successfully',
      data: asset,
    };
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


  

async update(id: string, updateAssetDto: UpdateAssetDto) {
  try {
    const asset = await this.prisma.asset.update({
      where: { id },
      data: updateAssetDto,
    });

    return {
      message: 'Asset updated successfully',
      data: asset,
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Asset not found');
      }

      if (error.code === 'P2002') {
        throw new ConflictException(
          'Asset symbol already exists',
        );
      }
    }

    throw error;
  }
}




async remove(id: string) {
  try {
    const asset = await this.prisma.asset.delete({
      where: { id },
    });

    return {
      message: 'Asset deleted successfully',
      data: asset,
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Asset not found');
    }

    throw error;
  }
}


async updateStatus(
  id: string,
  updateAssetStatusDto: UpdateAssetStatusDto,
) {
  try {
    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        status: updateAssetStatusDto.status,
      },
    });

    return {
      message: 'Asset status updated successfully',
      data: asset,
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Asset not found');
    }

    throw error;
  }
}


}
