import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  MonitoringAlertActionDto,
  MonitoringAlertDetailResponseDto,
  MonitoringAlertEvaluationResponseDto,
  MonitoringAlertListResponseDto,
  MonitoringAlertQueryDto,
  MonitoringAlertResponseDto,
} from './dto/monitoring-alert.dto';
import { MonitoringAlertsService } from './monitoring-alerts.service';

const monitoringAlertViewRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
  RoleName.EMPLOYEE,
];
const monitoringAlertManageRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.COMPANY_ADMIN,
  RoleName.HR,
  RoleName.MANAGER,
];

@ApiTags('Monitoring Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring/alerts')
export class MonitoringAlertsController {
  constructor(private readonly service: MonitoringAlertsService) {}

  @Get()
  @Roles(...monitoringAlertViewRoles)
  @ApiOperation({ summary: 'List monitoring alerts' })
  @ApiOkResponse({ type: MonitoringAlertListResponseDto })
  list(
    @Query() query: MonitoringAlertQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(query, user);
  }

  @Get(':alertId')
  @Roles(...monitoringAlertViewRoles)
  @ApiOperation({ summary: 'Get monitoring alert details and lifecycle history' })
  @ApiOkResponse({ type: MonitoringAlertDetailResponseDto })
  detail(
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.detail(alertId, user);
  }

  @Patch(':alertId/acknowledge')
  @Roles(...monitoringAlertManageRoles)
  @ApiOperation({ summary: 'Acknowledge a visible monitoring alert' })
  @ApiOkResponse({ type: MonitoringAlertResponseDto })
  acknowledge(
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: MonitoringAlertActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.acknowledge(alertId, dto, user);
  }

  @Patch(':alertId/resolve')
  @Roles(...monitoringAlertManageRoles)
  @ApiOperation({ summary: 'Resolve a visible monitoring alert' })
  @ApiOkResponse({ type: MonitoringAlertResponseDto })
  resolve(
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: MonitoringAlertActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resolve(alertId, dto, user);
  }

  @Post('evaluate')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Run monitoring alert detection now' })
  @ApiOkResponse({ type: MonitoringAlertEvaluationResponseDto })
  evaluate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.evaluate(user);
  }
}
