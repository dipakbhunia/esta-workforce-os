import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RenameMonitoringDeviceDto {
  @ApiProperty({ example: 'Dipak Workstation' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  deviceName!: string;
}

export class ReassignMonitoringDeviceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;
}

export class UpdateMonitoringDeviceMonitoringDto {
  @ApiProperty({ example: true })
  @Type(() => Boolean)
  @IsBoolean()
  enabled!: boolean;
}
