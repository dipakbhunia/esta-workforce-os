import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class EmailTemplateHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class CreateEmailTemplateDraftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) templateRevision!: number;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(998) subjectTemplate!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100000) textBodyTemplate!: string;
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1) placeholderContractVersion!: number;
}

export class UpdateEmailTemplateDraftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(998) subjectTemplate!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100000) textBodyTemplate!: string;
  @ApiProperty({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1) placeholderContractVersion!: number;
}

export class ValidateEmailTemplateDraftDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}

export class PublishEmailTemplateVersionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) templateRevision!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) targetRevision!: number;
}

export class RollbackEmailTemplateVersionDto extends PublishEmailTemplateVersionDto {}

export class PreviewEmailTemplateVersionDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) revision!: number;
}
