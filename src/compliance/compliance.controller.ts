
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ComplianceService } from './compliance.service.js';
import { CreateComplianceCaseDto } from './dto/create-compliance-case.dto.js';
import { ReviewComplianceCaseDto } from './dto/review-compliance-case.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('compliance')
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
  ) {}

  // 1. CREATE COMPLIANCE CASE
  @Post()
  create(
    @Body() dto: CreateComplianceCaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceService.create(
      dto,
      req.user.userId,
    );
  }

  // 2. GET COMPLIANCE DASHBOARD
  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'COMPLIANCE_OFFICER')
  getDashboard() {
    return this.complianceService.getDashboard();
  }

  // 3. GET ALL COMPLIANCE CASES
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceService.findAll(
      req.user.userId,
      req.user.role,
    );
  }

  // 4. REVIEW COMPLIANCE CASE
  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('COMPLIANCE_OFFICER', 'ADMIN')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewComplianceCaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceService.review(
      id,
      dto,
      req.user.userId,
    );
  }

  // 5. GET COMPLIANCE CASE AUDIT LOGS
  @Get(':id/audit-logs')
  findAuditLogs(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceService.findAuditLogs(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  // 6. GET SINGLE COMPLIANCE CASE
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceService.findOne(
      id,
      req.user.userId,
      req.user.role,
    );
  }
}
