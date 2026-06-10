import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeStatus,
  EmploymentType,
  WorkMode,
} from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const phonePattern = /^\+?[0-9][0-9 ()-]{6,19}$/;

export class CreateEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'EMP-0001' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  employeeCode!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  designationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  reportingManagerId?: string;

  @ApiProperty({ example: '2026-06-10', format: 'date' })
  @IsDateString({ strict: true })
  joiningDate!: string;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty({ enum: WorkMode })
  @IsEnum(WorkMode)
  workMode!: WorkMode;

  @ApiPropertyOptional({ enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
  @IsEnum(EmployeeStatus)
  @IsOptional()
  status?: EmployeeStatus;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @Matches(phonePattern)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @Matches(phonePattern)
  @IsOptional()
  alternatePhone?: string;

  @ApiPropertyOptional({ example: 'personal@example.com' })
  @IsEmail()
  @MaxLength(254)
  @IsOptional()
  personalEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  @IsOptional()
  emergencyContactRelationship?: string;

  @ApiPropertyOptional()
  @Matches(phonePattern)
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  state?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Document metadata placeholder only. File upload and storage are not implemented.',
  })
  @IsObject()
  @IsOptional()
  documents?: Record<string, unknown>;
}
