import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RoleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Super-admin filter only' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsEnum(RoleName)
  @IsOptional()
  systemName?: RoleName;
}
