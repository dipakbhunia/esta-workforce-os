import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'JWT refresh token returned by login or refresh' })
  @IsJWT()
  refreshToken!: string;
}
