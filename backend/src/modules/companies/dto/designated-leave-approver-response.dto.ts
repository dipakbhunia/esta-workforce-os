import { ApiProperty } from '@nestjs/swagger';

export class DesignatedLeaveApproverIdentityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;
}

export class DesignatedLeaveApproverResponseDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  designatedLeaveApproverUserId!: string | null;

  @ApiProperty({
    type: DesignatedLeaveApproverIdentityDto,
    nullable: true,
  })
  designatedLeaveApprover!: DesignatedLeaveApproverIdentityDto | null;
}
