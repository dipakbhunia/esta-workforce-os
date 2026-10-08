import { ApiProperty } from '@nestjs/swagger';

export class DesignatedAttendanceApproverIdentityDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
}

export class DesignatedAttendanceApproverResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  designatedAttendanceApproverUserId!: string | null;

  @ApiProperty({ type: DesignatedAttendanceApproverIdentityDto, nullable: true })
  designatedAttendanceApprover!: DesignatedAttendanceApproverIdentityDto | null;
}
