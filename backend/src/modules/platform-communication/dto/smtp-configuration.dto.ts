import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SmtpSecurityMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSmtpConfigurationDraftDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(253) host!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port!: number;
  @ApiProperty({ enum: SmtpSecurityMode }) @IsEnum(SmtpSecurityMode) securityMode!: SmtpSecurityMode;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(320) username!: string;
  @ApiProperty({ writeOnly: true }) @IsString() @MinLength(8) @MaxLength(4096) password!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) senderEmail!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) senderDisplayName!: string;
}

export class UpdateSmtpConfigurationDraftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(253) host?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port?: number;
  @ApiPropertyOptional({ enum: SmtpSecurityMode }) @IsOptional() @IsEnum(SmtpSecurityMode) securityMode?: SmtpSecurityMode;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(320) username?: string;
  @ApiPropertyOptional({ writeOnly: true }) @IsOptional() @IsString() @MinLength(8) @MaxLength(4096) password?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) senderEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(160) senderDisplayName?: string;
}

export class ValidateSmtpConfigurationDraftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class TestSmtpConnectionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class SendSmtpTestEmailDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class BootstrapEmailVerificationDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class BootstrapPlatformInvitationDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
  @ApiProperty() @IsUUID() targetUserId!: string;
  @ApiProperty() @IsUUID() deliveryId!: string;
}

export class ActivateSmtpConfigurationDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) settingsRevision!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) targetRevision!: number;
}

export class RollbackSmtpConfigurationDto extends ActivateSmtpConfigurationDto {}

export class ToggleDatabaseSmtpDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) settingsRevision!: number;
}

export class SmtpConfigurationHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
