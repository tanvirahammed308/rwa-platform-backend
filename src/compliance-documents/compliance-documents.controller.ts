
import {
  Controller,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Get,
  Patch,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Res,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import { basename, extname, join, resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { readFile } from 'fs/promises';

import type { Response } from 'express';

import { ComplianceDocumentsService } from './compliance-documents.service.js';

import { ReviewComplianceDocumentDto } from './dto/review-compliance-document.dto.js';

import { CreateComplianceDocumentDto } from './dto/create-compliance-document.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface.js';

@Controller('compliance-documents')
@UseGuards(JwtAuthGuard)
export class ComplianceDocumentsController {
  constructor(
    private readonly complianceDocumentsService: ComplianceDocumentsService,
  ) {}

  @Get(':complianceCaseId')
  findAll(
    @Param('complianceCaseId') complianceCaseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceDocumentsService.findAll(
      complianceCaseId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':complianceCaseId')
  create(
    @Param('complianceCaseId') complianceCaseId: string,
    @Body() dto: CreateComplianceDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceDocumentsService.create(
  complianceCaseId,
  req.user.userId,
  req.user.role,
  dto,
);
  }

  @Patch(':documentId/review')
  review(
    @Param('documentId') documentId: string,
    @Body() dto: ReviewComplianceDocumentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceDocumentsService.review(
      documentId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Get(':documentId/audit-logs')
  getAuditLogs(
    @Param('documentId') documentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.complianceDocumentsService.getAuditLogs(
      documentId,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':complianceCaseId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueName =
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

          callback(
            null,
            `${uniqueName}${extname(file.originalname)}`,
          );
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          return callback(
            new BadRequestException('Only PDF files are allowed'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async uploadDocument(
    @Param('complianceCaseId') complianceCaseId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }

    try {
      // Verify actual PDF signature
      const fileBuffer = await readFile(file.path);

      const fileSignature = fileBuffer
        .subarray(0, 5)
        .toString('ascii');

      if (fileSignature !== '%PDF-') {
        throw new BadRequestException(
          'Invalid PDF file content',
        );
      }

      return await this.complianceDocumentsService.uploadFile(
        complianceCaseId,
        req.user.userId,
        req.user.role,
        file,
      );
    } catch (error) {
      // Remove uploaded file if validation or service fails
      if (existsSync(file.path)) {
        unlinkSync(file.path);
      }

      throw error;
    }
  }

  

@Get(':documentId/download')
async downloadDocument(
  @Param('documentId') documentId: string,
  @Req() req: AuthenticatedRequest,
  @Res() res: Response,
) {
  const document =
    await this.complianceDocumentsService.getDownloadInfo(
      documentId,
      req.user.userId,
      req.user.role,
    );

  // Reject metadata-only documents
  if (!document.fileUrl) {
    throw new NotFoundException(
      'No physical file is associated with this document',
    );
  }

  const storedPath = document.fileUrl;
  const fileName = basename(storedPath);

  // Validate the stored path
  if (
    !storedPath.startsWith('/uploads/') ||
    storedPath.includes('\\') ||
    !fileName ||
    storedPath !== `/uploads/${fileName}`
  ) {
    throw new BadRequestException('Invalid document file path');
  }

  // Resolve the file inside uploads directory
  const uploadsDirectory = resolve(process.cwd(), 'uploads');
  const filePath = resolve(uploadsDirectory, fileName);

  if (!existsSync(filePath)) {
    throw new NotFoundException('Physical file not found');
  }

  return res.download(filePath, document.fileName);
}


}
