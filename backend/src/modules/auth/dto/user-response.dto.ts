import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName, UserStatus } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  companyId!: string | null;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;

  @ApiProperty({ example: 'Demo' })
  firstName!: string;

  @ApiProperty({ example: 'Admin' })
  lastName!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: RoleName, isArray: true })
  roles!: RoleName[];
}
