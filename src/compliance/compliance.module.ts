import { Module } from '@nestjs/common';

import { ComplianceController } from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}