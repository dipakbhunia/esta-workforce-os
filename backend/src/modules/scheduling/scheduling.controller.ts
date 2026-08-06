import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { requireTenantId } from '../../common/utils/tenant.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ResolveDayQueryDto } from './dto/scheduling.dto';
import { WorkCalendarService } from './work-calendar.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly workCalendar: WorkCalendarService) {}

  @Get('resolve-day')
  @ApiOperation({ summary: 'Resolve employee roster, work calendar, and shift for a date' })
  resolveDay(@Query() query: ResolveDayQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workCalendar.resolveDay({
      companyId: requireTenantId(user),
      employeeId: query.employeeId,
      workDate: query.workDate,
      timestamp: query.timestamp ? new Date(query.timestamp) : undefined,
    });
  }
}
