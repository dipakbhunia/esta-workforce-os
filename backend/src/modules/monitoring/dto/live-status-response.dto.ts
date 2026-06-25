import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringDeviceStatus } from '@prisma/client';
import { LiveStatusValue } from './live-status-query.dto';

export enum LiveHeartbeatState {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
}

export enum LiveAttendanceState {
  READY_TO_PUNCH_IN = 'READY_TO_PUNCH_IN',
  PUNCHED_IN = 'PUNCHED_IN',
  ON_BREAK = 'ON_BREAK',
  PUNCHED_OUT = 'PUNCHED_OUT',
  AUTO_PUNCHED_OUT = 'AUTO_PUNCHED_OUT',
}

export class LiveStatusUserDto {
  @ApiProperty({ example: 'Demo Admin' })
  name!: string;

  @ApiProperty({ example: 'admin@demo.esta.local' })
  email!: string;
}

export class LiveStatusDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Windows Device' })
  name!: string;

  @ApiProperty({ example: 'win32' })
  platform!: string;

  @ApiProperty({ enum: MonitoringDeviceStatus })
  status!: MonitoringDeviceStatus;
}

export class LiveStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: LiveStatusUserDto })
  user!: LiveStatusUserDto;

  @ApiProperty({ enum: LiveStatusValue })
  status!: LiveStatusValue;

  @ApiProperty({ enum: LiveAttendanceState })
  attendanceState!: LiveAttendanceState;

  @ApiProperty({ enum: LiveHeartbeatState })
  heartbeatState!: LiveHeartbeatState;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastHeartbeatAt!: string | null;

  @ApiProperty()
  isOnBreak!: boolean;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchedInAt!: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  punchedOutAt!: string | null;

  @ApiPropertyOptional({ type: LiveStatusDeviceDto, nullable: true })
  device!: LiveStatusDeviceDto | null;
}
