import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class PlatformUserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserStatus }) @IsEnum(UserStatus) @IsOptional() status?: UserStatus;
}

export class CreatePlatformUserDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @ApiProperty({ type: [String], format: 'uuid' }) @IsArray() @ArrayNotEmpty() @ArrayMaxSize(10) @IsUUID('4', { each: true }) roleIds!: string[];
}

export class UpdatePlatformUserDto {
  @ApiPropertyOptional() @IsEmail() @MaxLength(254) @IsOptional() email?: string;
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(80) @IsOptional() firstName?: string;
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(80) @IsOptional() lastName?: string;
}

export class PlatformUserStatusDto {
  @ApiProperty({ enum: UserStatus }) @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.SUSPENDED]) status!: UserStatus;
}

export class PlatformRoleAssignmentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() roleId!: string;
}

export class PlatformRoleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RoleName }) @IsEnum(RoleName) @IsOptional() systemName?: RoleName;
}

export class PlatformAuditQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @ApiPropertyOptional({ default: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit = 20;
  @ApiPropertyOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,99}$/) @IsOptional() action?: string;
  @ApiPropertyOptional() @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]{0,99}$/) @IsOptional() entityType?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() actorUserId?: string;
}
