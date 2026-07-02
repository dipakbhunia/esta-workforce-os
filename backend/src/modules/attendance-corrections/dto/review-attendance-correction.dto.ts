import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceCorrectionStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAttendanceCorrectionDto {
  @ApiProperty({
    enum: [
      AttendanceCorrectionStatus.APPROVED,
      AttendanceCorrectionStatus.REJECTED,
    ],
  })
  @IsIn([
    AttendanceCorrectionStatus.APPROVED,
    AttendanceCorrectionStatus.REJECTED,
  ])
  status!: AttendanceCorrectionStatus;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  reviewerComment?: string;
}
