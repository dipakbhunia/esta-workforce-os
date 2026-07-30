import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateMonitoringAlertPolicyDto,
  MonitoringAlertPolicyListResponseDto,
  MonitoringAlertPolicyQueryDto,
  MonitoringAlertPolicyResponseDto,
  UpdateMonitoringAlertPolicyDto,
} from './dto/monitoring-alert-policy.dto';
import { MonitoringAlertPoliciesService } from './monitoring-alert-policies.service';

const policyRoles = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Monitoring Alert Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...policyRoles)
@Controller('monitoring/alert-policies')
export class MonitoringAlertPoliciesController {
  constructor(private readonly service: MonitoringAlertPoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'List monitoring alert policies' })
  @ApiOkResponse({ type: MonitoringAlertPolicyListResponseDto })
  list(@Query() query: MonitoringAlertPolicyQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get monitoring alert policy details' })
  @ApiOkResponse({ type: MonitoringAlertPolicyResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create monitoring alert policy' })
  @ApiOkResponse({ type: MonitoringAlertPolicyResponseDto })
  create(@Body() dto: CreateMonitoringAlertPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update monitoring alert policy' })
  @ApiOkResponse({ type: MonitoringAlertPolicyResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMonitoringAlertPolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete monitoring alert policy' })
  @ApiOkResponse({ type: MonitoringAlertPolicyResponseDto })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }
}
