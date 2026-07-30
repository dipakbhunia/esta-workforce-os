import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ReassignMonitoringDeviceDto, RenameMonitoringDeviceDto, UpdateMonitoringDeviceMonitoringDto } from './dto/device-actions.dto';
import { DeviceHistoryQueryDto, DeviceHistoryResponseDto } from './dto/device-history.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LiveStatusQueryDto } from './dto/live-status-query.dto';
import { LiveStatusResponseDto } from './dto/live-status-response.dto';
import { MonitoringIdleQueryDto, MonitoringIdleResponseDto } from './dto/monitoring-idle.dto';
import { MonitoringOperationsDashboardResponseDto, MonitoringOperationsQueryDto, MonitoringOperationsReportQueryDto } from './dto/monitoring-operations.dto';
import { MonitoringReadQueryDto } from './dto/monitoring-read-query.dto';
import {
  PaginatedMonitoringActivityResponseDto,
  PaginatedMonitoringApplicationUsageResponseDto,
  MonitoringDeviceActionResponseDto,
  MonitoringDeviceDetailResponseDto,
  MonitoringDeviceOverviewResponseDto,
  PaginatedMonitoringDeviceResponseDto,
  PaginatedMonitoringScreenshotResponseDto,
  PaginatedMonitoringSummaryResponseDto,
  PaginatedMonitoringWebsiteUsageResponseDto,
  ScreenshotUploadResponseDto,
  ScreenshotViewResponseDto,
} from './dto/monitoring-read-response.dto';
import { MonitoringSummaryQueryDto } from './dto/monitoring-summary-query.dto';
import { MonitoringTimelineQueryDto, MonitoringTimelineResponseDto } from './dto/monitoring-timeline.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UploadActivityDto } from './dto/upload-activity.dto';
import { UploadScreenshotDto } from './dto/upload-screenshot.dto';
import { MonitoringOperationsService } from './monitoring-operations.service';
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
  constructor(private readonly service: MonitoringService, private readonly operations: MonitoringOperationsService) {}


  @Get('operations/dashboard')
  @ApiOperation({ summary: 'Get monitoring operations dashboard analytics' })
  @ApiOkResponse({ type: MonitoringOperationsDashboardResponseDto })
  operationsDashboard(
    @Query() query: MonitoringOperationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.operations.dashboard(query, user);
  }

  @Get('operations/report')
  @ApiOperation({ summary: 'Export monitoring operations report as CSV or PDF' })
  async operationsReport(
    @Query() query: MonitoringOperationsReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const report = await this.operations.report(query, user);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }
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

  @Get('idle')
  @ApiOperation({
    summary: 'Get idle time analytics',
    description: 'Returns server-side idle analytics derived from persisted activity sessions for the visible employee scope.',
  })
  @ApiOkResponse({ type: MonitoringIdleResponseDto })
  idle(
    @Query() query: MonitoringIdleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.idle(query, user);
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

  @Get('screenshots/:id/view')
  @ApiOperation({ summary: 'Get a short-lived screenshot preview URL' })
  @ApiOkResponse({ type: ScreenshotViewResponseDto })
  viewScreenshot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.viewScreenshot(id, user);
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

  @Get('devices/overview')
  @ApiOperation({ summary: 'Get aggregated monitoring device overview' })
  @ApiOkResponse({ type: MonitoringDeviceOverviewResponseDto })
  devicesOverview(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.devicesOverview(user);
  }

  @Get('devices/:deviceId/detail')
  @ApiOperation({ summary: 'Get a read-only monitoring device profile' })
  @ApiOkResponse({ type: MonitoringDeviceDetailResponseDto })
  deviceDetail(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deviceDetail(deviceId, user);
  }

  @Get('devices/:deviceId/history')
  @ApiOperation({ summary: 'List monitoring device audit history' })
  @ApiOkResponse({ type: DeviceHistoryResponseDto })
  deviceHistory(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Query() query: DeviceHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deviceHistory(deviceId, query, user);
  }
  @Patch('devices/:deviceId/name')
  @ApiOperation({ summary: 'Rename a monitoring device display name' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  renameDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: RenameMonitoringDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.renameDevice(deviceId, dto, user);
  }

  @Patch('devices/:deviceId/assignment')
  @ApiOperation({ summary: 'Reassign a monitoring device to another active employee' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  reassignDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: ReassignMonitoringDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.reassignDevice(deviceId, dto, user);
  }

  @Patch('devices/:deviceId/monitoring')
  @ApiOperation({ summary: 'Enable or disable monitoring ingestion for a device' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  updateDeviceMonitoring(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: UpdateMonitoringDeviceMonitoringDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateDeviceMonitoring(deviceId, dto, user);
  }

  @Patch('devices/:deviceId/trust')
  @ApiOperation({ summary: 'Mark a monitoring device as trusted' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  trustDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.trustDevice(deviceId, user);
  }

  @Patch('devices/:deviceId/revoke')
  @ApiOperation({ summary: 'Revoke a monitoring device without deleting history' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  revokeDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.revokeDevice(deviceId, user);
  }

  @Post('devices/:deviceId/reset-registration')
  @ApiOperation({ summary: 'Reset monitoring device registration state' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  resetDeviceRegistration(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resetDeviceRegistration(deviceId, user);
  }

  @Post('devices/:deviceId/force-reregister')
  @ApiOperation({ summary: 'Force a monitoring device to perform fresh registration' })
  @ApiOkResponse({ type: MonitoringDeviceActionResponseDto })
  forceDeviceReregistration(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.forceDeviceReregistration(deviceId, user);
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Upload screenshot image and metadata' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        deviceId: { type: 'string', format: 'uuid' },
        clientCaptureId: { type: 'string' },
        capturedAt: { type: 'string', format: 'date-time' },
        mimeType: { type: 'string', example: 'image/jpeg' },
        width: { type: 'number' },
        height: { type: 'number' },
        sizeBytes: { type: 'number' },
        attendanceId: { type: 'string', format: 'uuid' },
        applicationName: { type: 'string' },
        windowTitle: { type: 'string' },
        checksum: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
      required: ['file', 'deviceId', 'clientCaptureId', 'capturedAt', 'mimeType'],
    },
  })
  @ApiOkResponse({ type: ScreenshotUploadResponseDto })
  uploadScreenshot(
    @Body() dto: UploadScreenshotDto,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.uploadScreenshot(dto, user, file);
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
  @ApiOkResponse({ type: PaginatedMonitoringSummaryResponseDto })
  summary(
    @Query() query: MonitoringSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.summary(query, user);
  }
}
