import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentSource, ShiftAssignmentType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateShiftAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shiftId!: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Inclusive UTC DateTime boundary. Effective range semantics: effectiveFrom <= timestamp < effectiveTo.',
  })
  @IsDateString({ strict: true })
  effectiveFrom!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description:
      'Exclusive UTC DateTime boundary. Null keeps the assignment open-ended.',
  })
  @IsDateString({ strict: true })
  @IsOptional()
  effectiveTo?: string;

  @ApiPropertyOptional({ enum: ShiftAssignmentType, default: ShiftAssignmentType.PERMANENT })
  @IsEnum(ShiftAssignmentType)
  @IsOptional()
  assignmentType?: ShiftAssignmentType;

  @ApiPropertyOptional({ enum: AssignmentSource, default: AssignmentSource.SHIFT_ASSIGNMENT })
  @IsEnum(AssignmentSource)
  @IsOptional()
  source?: AssignmentSource;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
