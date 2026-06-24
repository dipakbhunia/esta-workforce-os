import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendanceService } from './attendance.service';
import { AttendanceActionDto } from './dto/attendance-action.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
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
  @ApiOperation({ summary: 'Punch in for the authenticated employee' })
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
      'Also enforces company heartbeat-loss auto punch-out for stale open attendance sessions before calculating the summary. Future BullMQ/cron scheduling will call the same enforcement service method.',
  })
  summary(
    @Query() query: AttendanceSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.summary(query, user);
  }
}
