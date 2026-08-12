import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CompanyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CompanyStatus })
  @IsEnum(CompanyStatus)
  @IsOptional()
  status?: CompanyStatus;
}
