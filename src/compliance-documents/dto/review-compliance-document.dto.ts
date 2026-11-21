
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
} from 'class-validator';

export class ReviewComplianceDocumentDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  status: string;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
