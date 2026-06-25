import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LiveStatusQueryDto } from './dto/live-status-query.dto';
import { LiveStatusResponseDto } from './dto/live-status-response.dto';
import { MonitoringSummaryQueryDto } from './dto/monitoring-summary-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UploadActivityDto } from './dto/upload-activity.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';
import { MonitoringService } from './monitoring.service';

const monitoringRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@ApiTags('Employee Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...monitoringRoles)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  @Post('devices/register')
  @ApiOperation({ summary: 'Register or refresh the authenticated employee device' })
  registerDevice(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.registerDevice(dto, user);
  }

  @Post('heartbeats')
  @ApiOperation({
    summary: 'Receive a heartbeat from an owned monitoring device',
    description:
      'Before recording a new heartbeat, the backend enforces stale open attendance sessions. If the latest previous heartbeat exceeded the company heartbeat timeout, attendance is auto punched out at that previous heartbeat timestamp.',
  })
  receiveHeartbeat(
    @Body() dto: HeartbeatDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.receiveHeartbeat(dto, user);
  }

  @Post('activity')
  @ApiOperation({
    summary: 'Upload an activity session with application and website usage',
  })
  uploadActivity(
    @Body() dto: UploadActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.uploadActivity(dto, user);
  }

  @Post('screenshots')
  @ApiOperation({
    summary: 'Upload screenshot metadata only',
    description: 'Image bytes and MinIO upload are intentionally not implemented.',
  })
  uploadScreenshot(
    @Body() dto: UploadScreenshotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.uploadScreenshot(dto, user);
  }

  @Get('live-status')
  @ApiOperation({
    summary: 'List normalized employee live statuses',
    description:
      'Combines latest heartbeat, active attendance session, break state, punched-out state, and company heartbeat timeout policy into a normalized live status.',
  })
  @ApiOkResponse({ type: LiveStatusResponseDto, isArray: true })
  liveStatus(
    @Query() query: LiveStatusQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.liveStatus(query, user);
  }

  @Get('live-status/:employeeId')
  @ApiOperation({
    summary: 'Get normalized live status for one employee',
    description:
      'Applies the same tenant and reporting-line visibility rules as the live-status list endpoint.',
  })
  @ApiOkResponse({ type: LiveStatusResponseDto })
  liveStatusByEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveStatusResponseDto> {
    return this.service.liveStatusByEmployee(employeeId, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get paginated employee monitoring summaries' })
  summary(
    @Query() query: MonitoringSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.summary(query, user);
  }
}


