import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'backend' })
  service!: 'backend';

  @ApiProperty({ example: 'connected' })
  database!: 'connected';
}
