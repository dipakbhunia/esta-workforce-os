import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export class UserStatusDto {
  @ApiProperty({ enum: [UserStatus.ACTIVE, UserStatus.INACTIVE] })
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE])
  status!: UserStatus;
}
