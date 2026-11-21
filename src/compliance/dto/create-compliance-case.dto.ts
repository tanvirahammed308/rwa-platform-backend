import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateComplianceCaseDto {
  @IsString()
  @IsNotEmpty()
  assetId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}