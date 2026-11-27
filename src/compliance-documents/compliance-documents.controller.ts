
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
  Res,
} from '@nestjs/common';

import {
  ThrottlerGuard,
  Throttle,
} from '@nestjs/throttler';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

import {
  basename,
  extname,
  resolve,
  relative,
  isAbsolute,
} from 'path';

import {
  existsSync,
  unlinkSync,
  realpathSync,
  lstatSync,
} from 'fs';

import { readFile } from 'fs/promises';

import type { Response } from 'express';

import { createHash } from 'crypto';

import { PDFDocument } from 'pdf-lib';

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

  // =========================================
  // 1. CREATE DOCUMENT METADATA
  // =========================================

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

  // =========================================
  // 2. GET ALL DOCUMENTS
  // =========================================

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

  // =========================================
  // 3. REVIEW DOCUMENT
  // =========================================

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

  // =========================================
  // 4. GET DOCUMENT AUDIT LOGS
  // =========================================

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

  // =========================================
  // 5. UPLOAD COMPLIANCE DOCUMENT
  // =========================================

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
        const extension = extname(
          file.originalname,
        ).toLowerCase();

        if (
          file.mimetype !== 'application/pdf' ||
          extension !== '.pdf'
        ) {
          return callback(
            new BadRequestException(
              'Only PDF files with .pdf extension are allowed',
            ),
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
      throw new BadRequestException(
        'PDF file is required',
      );
    }

    try {
      // Step 1: Read uploaded file

      const fileBuffer = await readFile(file.path);

      // Step 2: Validate actual PDF signature

      const expectedSignature = Buffer.from('%PDF-');

      const actualSignature = fileBuffer.subarray(0, 5);

      if (!actualSignature.equals(expectedSignature)) {
        throw new BadRequestException(
          'Invalid PDF file content',
        );
      }

      // Step 3: Validate PDF internal structure

      try {
        const pdfDocument = await PDFDocument.load(
          fileBuffer,
          {
            throwOnInvalidObject: true,
          },
        );

        if (pdfDocument.getPageCount() === 0) {
          throw new BadRequestException(
            'PDF must contain at least one page',
          );
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }

        console.error('PDF parsing failed:', error);

        throw new BadRequestException(
          'Invalid or corrupted PDF file',
        );
      }

      // Step 4: Generate SHA-256 hash

      const fileHash = createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Step 5: Upload file and save metadata

      return await this.complianceDocumentsService.uploadFile(
        complianceCaseId,
        req.user.userId,
        req.user.role,
        file,
        fileHash,
      );
    } catch (error) {
      // Step 6: Delete physical file if upload fails

      if (existsSync(file.path)) {
        unlinkSync(file.path);
      }

      throw error;
    }
  }

  // =========================================
  // 6. DOWNLOAD COMPLIANCE DOCUMENT
  // =========================================

  @Get(':documentId/download')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  async downloadDocument(
    @Param('documentId') documentId: string,

    @Req() req: AuthenticatedRequest,

    @Res() res: Response,
  ) {
    // Step 1: Get authorized download information

    const document =
      await this.complianceDocumentsService.getDownloadInfo(
        documentId,
        req.user.userId,
        req.user.role,
      );

    // Step 2: Reject metadata-only documents

    if (!document.fileUrl) {
      throw new NotFoundException(
        'No physical file is associated with this document',
      );
    }

    const storedPath = document.fileUrl;

    const fileName = basename(storedPath);

    // Step 3: Validate stored path

    if (
      !storedPath.startsWith('/uploads/') ||
      storedPath.includes('\\') ||
      !fileName ||
      storedPath !== `/uploads/${fileName}` ||
      fileName === '.' ||
      fileName === '..'
    ) {
      throw new BadRequestException(
        'Invalid document file path',
      );
    }

    // Step 4: Resolve uploads directory

    const uploadsDirectory = resolve(
      process.cwd(),
      'uploads',
    );

    const filePath = resolve(
      uploadsDirectory,
      fileName,
    );

    // Step 5: Ensure file stays inside uploads directory

    const relativePath = relative(
      uploadsDirectory,
      filePath,
    );

    if (
      !relativePath ||
      relativePath.startsWith('..') ||
      isAbsolute(relativePath)
    ) {
      throw new BadRequestException(
        'Access to this file path is not allowed',
      );
    }

    // Step 6: Check physical file

    if (!existsSync(filePath)) {
      throw new NotFoundException(
        'Physical file not found',
      );
    }

    // Step 7: Reject symbolic links

    const fileStats = lstatSync(filePath);

    if (fileStats.isSymbolicLink()) {
      throw new BadRequestException(
        'Symbolic links are not allowed',
      );
    }

    // Step 8: Resolve real physical paths

    const realUploadsDirectory = realpathSync(
      uploadsDirectory,
    );

    const realFilePath = realpathSync(
      filePath,
    );

    // Step 9: Ensure real file stays inside uploads

    const realRelativePath = relative(
      realUploadsDirectory,
      realFilePath,
    );

    if (
      !realRelativePath ||
      realRelativePath.startsWith('..') ||
      isAbsolute(realRelativePath)
    ) {
      throw new BadRequestException(
        'Access outside uploads directory is not allowed',
      );
    }

    // Step 10: Download with secure cache headers

    return res.download(
      realFilePath,
      document.fileName,
      {
        cacheControl: false,
        headers: {
          'Cache-Control':
            'private, no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    );
  }
}
