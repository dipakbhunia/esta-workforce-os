import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ProductivityAnalyticsQueryDto,
  ProductivityAnalyticsResponseDto,
  ProductivityCoverageQueryDto,
  ProductivityCoverageResponseDto,
  ProductivityEmployeeDetailsQueryDto,
  ProductivityEmployeeDetailsResponseDto,
  ProductivityTrendsQueryDto,
  ProductivityTrendsResponseDto,
} from './dto/productivity-analytics.dto';
import {
  ClassifyApplicationDto,
  ClassifyWebsiteDto,
  CreateApplicationProductivityRuleDto,
  CreateWebsiteProductivityRuleDto,
  ProductivityRuleQueryDto,
  UpdateApplicationProductivityRuleDto,
  UpdateWebsiteProductivityRuleDto,
} from './dto/productivity-rule.dto';
import {
  ApplicationProductivityRuleResponseDto,
  PaginatedApplicationProductivityRuleResponseDto,
  PaginatedWebsiteProductivityRuleResponseDto,
  ProductivityClassificationResponseDto,
  WebsiteProductivityRuleResponseDto,
} from './dto/productivity-response.dto';
import { ProductivityService } from './productivity.service';

const productivityRoles = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR];
const productivityAnalyticsRoles = [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR, RoleName.MANAGER, RoleName.EMPLOYEE];

@ApiTags('Productivity Classification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...productivityRoles)
@Controller('monitoring/productivity')
export class ProductivityController {
  constructor(private readonly service: ProductivityService) {}

  @Get('analytics')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Get enterprise productivity analytics derived from classified app and website usage' })
  @ApiOkResponse({ type: ProductivityAnalyticsResponseDto })
  analytics(
    @Query() query: ProductivityAnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.analytics(query, user);
  }


  @Get('trends')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Get productivity trends, rankings, and benchmarks' })
  @ApiOkResponse({ type: ProductivityTrendsResponseDto })
  trends(
    @Query() query: ProductivityTrendsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.trends(query, user);
  }
  @Get('analytics/export')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Export productivity analytics as CSV' })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportAnalytics(
    @Query() query: ProductivityAnalyticsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportFile = await this.service.exportAnalyticsCsv(query, user);
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    return exportFile.content;
  }

  @Get('coverage')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Get classification coverage and top unclassified app/website usage' })
  @ApiOkResponse({ type: ProductivityCoverageResponseDto })
  coverage(
    @Query() query: ProductivityCoverageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.coverage(query, user);
  }

  @Get('coverage/export')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Export productivity classification coverage as CSV' })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCoverage(
    @Query() query: ProductivityCoverageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportFile = await this.service.exportCoverageCsv(query, user);
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    return exportFile.content;
  }

  @Get('employees/:employeeId/export')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Export one employee productivity usage drill-down as CSV' })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: ProductivityEmployeeDetailsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportFile = await this.service.exportEmployeeCsv(employeeId, query, user);
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    return exportFile.content;
  }

  @Get('employees/:employeeId')
  @Roles(...productivityAnalyticsRoles)
  @ApiOperation({ summary: 'Get one employee productivity drill-down with application, website, and timeline details' })
  @ApiOkResponse({ type: ProductivityEmployeeDetailsResponseDto })
  employeeDetails(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: ProductivityEmployeeDetailsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.employeeDetails(employeeId, query, user);
  }
    @Post('applications')
  @ApiOperation({ summary: 'Create application productivity classification rule' })
  @ApiOkResponse({ type: ApplicationProductivityRuleResponseDto })
  createApplication(
    @Body() dto: CreateApplicationProductivityRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createApplication(dto, user);
  }

  @Get('applications')
  @ApiOperation({ summary: 'List application productivity classification rules' })
  @ApiOkResponse({ type: PaginatedApplicationProductivityRuleResponseDto })
  listApplications(
    @Query() query: ProductivityRuleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listApplications(query, user);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Get application productivity classification rule' })
  @ApiOkResponse({ type: ApplicationProductivityRuleResponseDto })
  getApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getApplication(id, user);
  }

  @Patch('applications/:id')
  @ApiOperation({ summary: 'Update application productivity classification rule' })
  @ApiOkResponse({ type: ApplicationProductivityRuleResponseDto })
  updateApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationProductivityRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateApplication(id, dto, user);
  }

  @Delete('applications/:id')
  @ApiOperation({ summary: 'Soft-delete application productivity classification rule' })
  @ApiOkResponse({ type: ApplicationProductivityRuleResponseDto })
  deleteApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deleteApplication(id, user);
  }

  @Post('websites')
  @ApiOperation({ summary: 'Create website productivity classification rule' })
  @ApiOkResponse({ type: WebsiteProductivityRuleResponseDto })
  createWebsite(
    @Body() dto: CreateWebsiteProductivityRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createWebsite(dto, user);
  }

  @Get('websites')
  @ApiOperation({ summary: 'List website productivity classification rules' })
  @ApiOkResponse({ type: PaginatedWebsiteProductivityRuleResponseDto })
  listWebsites(
    @Query() query: ProductivityRuleQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listWebsites(query, user);
  }

  @Get('websites/:id')
  @ApiOperation({ summary: 'Get website productivity classification rule' })
  @ApiOkResponse({ type: WebsiteProductivityRuleResponseDto })
  getWebsite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getWebsite(id, user);
  }

  @Patch('websites/:id')
  @ApiOperation({ summary: 'Update website productivity classification rule' })
  @ApiOkResponse({ type: WebsiteProductivityRuleResponseDto })
  updateWebsite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebsiteProductivityRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateWebsite(id, dto, user);
  }

  @Delete('websites/:id')
  @ApiOperation({ summary: 'Soft-delete website productivity classification rule' })
  @ApiOkResponse({ type: WebsiteProductivityRuleResponseDto })
  deleteWebsite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deleteWebsite(id, user);
  }

  @Post('classify/application')
  @ApiOperation({ summary: 'Classify an application name using the reusable productivity matcher' })
  @ApiOkResponse({ type: ProductivityClassificationResponseDto })
  classifyApplication(
    @Body() dto: ClassifyApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.classifyApplication(dto, user);
  }

  @Post('classify/website')
  @ApiOperation({ summary: 'Classify a hostname using the reusable productivity matcher' })
  @ApiOkResponse({ type: ProductivityClassificationResponseDto })
  classifyWebsite(
    @Body() dto: ClassifyWebsiteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.classifyWebsite(dto, user);
  }
}
