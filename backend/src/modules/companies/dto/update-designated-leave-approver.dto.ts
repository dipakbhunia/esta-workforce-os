import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class UpdateDesignatedLeaveApproverDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsUUID('4')
  designatedLeaveApproverUserId!: string | null;
}
