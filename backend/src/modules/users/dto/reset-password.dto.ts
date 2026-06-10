import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, example: 'NewStrongPassword@123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
