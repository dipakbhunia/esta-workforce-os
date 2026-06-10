import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'windows-machine-guid-or-installation-uuid' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  deviceIdentifier!: string;

  @ApiProperty({ example: 'Dipak Workstation' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deviceName!: string;

  @ApiProperty({ example: 'windows' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  platform!: string;

  @ApiPropertyOptional({ example: '11.0.26100' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  osVersion?: string;

  @ApiPropertyOptional({ example: '0.1.0' })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  appVersion?: string;
}
