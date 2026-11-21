
import { Module } from '@nestjs/common';

import { ComplianceDocumentsController } from './compliance-documents.controller.js';

import { ComplianceDocumentsService } from './compliance-documents.service.js';

import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ComplianceDocumentsController],
  providers: [ComplianceDocumentsService],
})
export class ComplianceDocumentsModule {}
