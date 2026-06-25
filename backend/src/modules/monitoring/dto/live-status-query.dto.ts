import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export enum LiveStatusValue {
  ONLINE = 'ONLINE',
  WORKING = 'WORKING',
  ON_BREAK = 'ON_BREAK',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
  PUNCHED_OUT = 'PUNCHED_OUT',
  AUTO_PUNCHED_OUT = 'AUTO_PUNCHED_OUT',
}

export class LiveStatusQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LiveStatusValue })
  @IsEnum(LiveStatusValue)
  @IsOptional()
  status?: LiveStatusValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
