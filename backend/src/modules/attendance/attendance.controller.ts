import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendanceService } from './attendance.service';
import { AttendanceActionDto } from './dto/attendance-action.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import {
  AttendanceDetailResponseDto,
  AttendanceTimelineResponseDto,
} from './dto/attendance-response.dto';
import { AttendanceSummaryQueryDto } from './dto/attendance-summary-query.dto';

const attendanceRoles = [
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('punch-in')
  @Roles(...attendanceRoles)
  @ApiOperation({
    summary: 'Punch in for the authenticated employee',
    description:
      'Uses the active AttendancePolicy to compute the attendance day, close stale previous-day open sessions when enabled, and decide whether closed same-day sessions allow another punch-in.',
  })
  punchIn(
    @Body() dto: AttendanceActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.punchIn(dto, user);
  }

  @Post('punch-out')
  @Roles(...attendanceRoles)
  @ApiOperation({ summary: 'Punch out for the authenticated employee' })
  punchOut(
    @Body() dto: AttendanceActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.punchOut(dto, user);
  }

  @Post('break-start')
  @Roles(...attendanceRoles)
  @ApiOperation({ summary: 'Start a configured company break policy' })
  breakStart(
    @Body() dto: AttendanceActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.breakStart(dto, user);
  }

  @Post('break-end')
  @Roles(...attendanceRoles)
  breakEnd(@CurrentUser() user: AuthenticatedUser) {
    return this.service.breakEnd(user);
  }

  @Get()
  @Roles(...attendanceRoles)
  @ApiOperation({ summary: 'List attendance visible to the authenticated role' })
  findAll(
    @Query() query: AttendanceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(query, user);
  }

  @Get('summary')
  @Roles(...attendanceRoles)
  @ApiOperation({
    summary: 'Get a daily attendance summary',
    description:
      'Also enforces company heartbeat-loss auto punch-out for stale open attendance sessions before calculating the summary. Returns sessions, latestSession, canPunchIn, currentState, serverNow, totalWorkedSeconds, and totalBreakSeconds for desktop status and cumulative timer handling. Future BullMQ/cron scheduling will call the same enforcement service method.',
  })
  summary(
    @Query() query: AttendanceSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.summary(query, user);
  }

  @Get(':id/timeline')
  @Roles(...attendanceRoles)
  @ApiOperation({
    summary: 'Get a normalized attendance timeline',
    description:
      'Returns ordered punch, break, auto punch-out, and heartbeat-loss events for a visible attendance session.',
  })
  @ApiOkResponse({ type: AttendanceTimelineResponseDto })
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceTimelineResponseDto> {
    return this.service.timeline(id, user);
  }

  @Get(':id')
  @Roles(...attendanceRoles)
  @ApiOperation({ summary: 'Get attendance session details by id' })
  @ApiOkResponse({ type: AttendanceDetailResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AttendanceDetailResponseDto> {
    return this.service.findOne(id, user);
  }
}
