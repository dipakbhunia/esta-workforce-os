import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LiveStatusQueryDto } from './dto/live-status-query.dto';
import { LiveStatusResponseDto } from './dto/live-status-response.dto';
import { MonitoringReadQueryDto } from './dto/monitoring-read-query.dto';
import {
  PaginatedMonitoringActivityResponseDto,
  PaginatedMonitoringApplicationUsageResponseDto,
  PaginatedMonitoringDeviceResponseDto,
  PaginatedMonitoringScreenshotResponseDto,
  PaginatedMonitoringWebsiteUsageResponseDto,
} from './dto/monitoring-read-response.dto';
import { MonitoringSummaryQueryDto } from './dto/monitoring-summary-query.dto';
import { MonitoringTimelineQueryDto, MonitoringTimelineResponseDto } from './dto/monitoring-timeline.dto';
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

  @Get('timeline')
  @ApiOperation({
    summary: 'Get consolidated employee monitoring timeline',
    description:
      'Returns employee-wise timeline segments and markers derived from attendance, breaks, heartbeats, activity sessions, app and website usage, screenshots, and devices.',
  })
  @ApiOkResponse({ type: MonitoringTimelineResponseDto })
  timeline(
    @Query() query: MonitoringTimelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.timeline(query, user);
  }

  @Get('activity')
  @ApiOperation({ summary: 'List employee monitoring activity sessions' })
  @ApiOkResponse({ type: PaginatedMonitoringActivityResponseDto })
  activity(
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.activity(query, user);
  }

  @Get('activity/:employeeId')
  @ApiOperation({ summary: 'List monitoring activity sessions for one employee' })
  @ApiOkResponse({ type: PaginatedMonitoringActivityResponseDto })
  activityByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.activityByEmployee(employeeId, query, user);
  }

  @Get('screenshots')
  @ApiOperation({ summary: 'List screenshot metadata' })
  @ApiOkResponse({ type: PaginatedMonitoringScreenshotResponseDto })
  screenshots(
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.screenshots(query, user);
  }

  @Get('screenshots/:employeeId')
  @ApiOperation({ summary: 'List screenshot metadata for one employee' })
  @ApiOkResponse({ type: PaginatedMonitoringScreenshotResponseDto })
  screenshotsByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.screenshotsByEmployee(employeeId, query, user);
  }

  @Get('apps')
  @ApiOperation({ summary: 'List application usage entries' })
  @ApiOkResponse({ type: PaginatedMonitoringApplicationUsageResponseDto })
  applications(
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.applications(query, user);
  }

  @Get('apps/:employeeId')
  @ApiOperation({ summary: 'List application usage entries for one employee' })
  @ApiOkResponse({ type: PaginatedMonitoringApplicationUsageResponseDto })
  applicationsByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.applicationsByEmployee(employeeId, query, user);
  }

  @Get('websites')
  @ApiOperation({ summary: 'List website usage entries' })
  @ApiOkResponse({ type: PaginatedMonitoringWebsiteUsageResponseDto })
  websites(
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.websites(query, user);
  }

  @Get('websites/:employeeId')
  @ApiOperation({ summary: 'List website usage entries for one employee' })
  @ApiOkResponse({ type: PaginatedMonitoringWebsiteUsageResponseDto })
  websitesByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.websitesByEmployee(employeeId, query, user);
  }

  @Get('devices')
  @ApiOperation({ summary: 'List monitoring devices' })
  @ApiOkResponse({ type: PaginatedMonitoringDeviceResponseDto })
  devices(
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.devices(query, user);
  }

  @Get('devices/:employeeId')
  @ApiOperation({ summary: 'List monitoring devices for one employee' })
  @ApiOkResponse({ type: PaginatedMonitoringDeviceResponseDto })
  devicesByEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: MonitoringReadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.devicesByEmployee(employeeId, query, user);
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


