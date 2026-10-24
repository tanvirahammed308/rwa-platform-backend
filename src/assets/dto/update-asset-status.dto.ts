
import { IsIn } from 'class-validator';

export class UpdateAssetStatusDto {
  @IsIn([
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
  ])
  status: string;
}
