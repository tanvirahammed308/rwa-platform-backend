
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';

import { AssetsService } from './assets.service.js';

import { CreateAssetDto } from './dto/create-asset.dto.js';
import { UpdateAssetDto } from './dto/update-asset.dto.js';
import { UpdateAssetStatusDto } from './dto/update-asset-status.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
  ) {}

  // GET /api/assets
  // All authenticated users
  @Get()
  findAll() {
    return this.assetsService.findAll();
  }

  // GET /api/assets/archived
  // ADMIN only
  @Get('archived')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findArchived() {
    return this.assetsService.findArchived();
  }

  // GET /api/assets/:id/audit-logs
  // ADMIN and COMPLIANCE_OFFICER
  @Get(':id/audit-logs')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'COMPLIANCE_OFFICER')
  getAuditLogs(@Param('id') id: string) {
    return this.assetsService.getAuditLogs(id);
  }

  // POST /api/assets
  // ISSUER and ADMIN
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ISSUER', 'ADMIN')
  create(
    @Body() createAssetDto: CreateAssetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.create(
      createAssetDto,
      req.user.userId,
    );
  }

  // PATCH /api/assets/:id
  // ISSUER and ADMIN
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ISSUER', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() updateAssetDto: UpdateAssetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.update(
      id,
      updateAssetDto,
      req.user.userId,
      req.user.role,
    );
  }

  // PATCH /api/assets/:id/status
  // COMPLIANCE_OFFICER only
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('COMPLIANCE_OFFICER')
  updateStatus(
    @Param('id') id: string,
    @Body() updateAssetStatusDto: UpdateAssetStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.updateStatus(
      id,
      updateAssetStatusDto,
      req.user.userId,
    );
  }

  // PATCH /api/assets/:id/submit-for-review
  // ISSUER and ADMIN
  @Patch(':id/submit-for-review')
  @UseGuards(RolesGuard)
  @Roles('ISSUER', 'ADMIN')
  submitForReview(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.submitForReview(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  // PATCH /api/assets/:id/restore
  // ADMIN only
  @Patch(':id/restore')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  restore(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.restore(
      id,
      req.user.userId,
    );
  }

  // DELETE /api/assets/:id
  // ADMIN only
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assetsService.remove(
      id,
      req.user.userId,
    );
  }
}
