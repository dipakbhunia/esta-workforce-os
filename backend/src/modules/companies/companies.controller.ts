import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyQueryDto } from './dto/company-query.dto';
import {
  CompanyPaginatedResponseDto,
  CompanyResponseDto,
} from './dto/company-response.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateDesignatedLeaveApproverDto } from './dto/update-designated-leave-approver.dto';
import { DesignatedLeaveApproverResponseDto } from './dto/designated-leave-approver-response.dto';
import { UpdateDesignatedAttendanceApproverDto } from './dto/update-designated-attendance-approver.dto';
import { DesignatedAttendanceApproverResponseDto } from './dto/designated-attendance-approver-response.dto';
import { BillingContactIdentityDto, BillingContactResponseDto, EligibleBillingContactQueryDto, UpdateBillingContactDto } from './dto/billing-contact.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a company (super admin)' })
  @ApiCreatedResponse({ type: CompanyResponseDto })
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.create(dto, user);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'List accessible companies' })
  @ApiOkResponse({ type: CompanyPaginatedResponseDto })
  findAll(
    @Query() query: CompanyQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findAll(query, user);
  }

  @Get('current/leave-approver')
  @Roles(RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Get the current tenant designated leave approver' })
  @ApiOkResponse({ type: DesignatedLeaveApproverResponseDto })
  getDesignatedLeaveApprover(@CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.getDesignatedLeaveApprover(user);
  }

  @Patch('current/leave-approver')
  @Roles(RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Configure the current tenant designated leave approver' })
  @ApiOkResponse({ type: DesignatedLeaveApproverResponseDto })
  updateDesignatedLeaveApprover(
    @Body() dto: UpdateDesignatedLeaveApproverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.updateDesignatedLeaveApprover(dto, user);
  }

  @Get('current/attendance-approver')
  @Roles(RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Get the current tenant designated attendance approver' })
  @ApiOkResponse({ type: DesignatedAttendanceApproverResponseDto })
  getDesignatedAttendanceApprover(@CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.getDesignatedAttendanceApprover(user);
  }

  @Patch('current/attendance-approver')
  @Roles(RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Configure the current tenant designated attendance approver' })
  @ApiOkResponse({ type: DesignatedAttendanceApproverResponseDto })
  updateDesignatedAttendanceApprover(
    @Body() dto: UpdateDesignatedAttendanceApproverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.updateDesignatedAttendanceApprover(dto, user);
  }

  @Get(':id/billing-contact')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Get the designated commercial Billing Contact' })
  @ApiOkResponse({ type: BillingContactResponseDto })
  getBillingContact(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.companiesService.getBillingContact(id, actor);
  }

  @Get(':id/billing-contact/eligible-users')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List eligible same-company Billing Contact users' })
  @ApiOkResponse({ type: [BillingContactIdentityDto] })
  listEligibleBillingContacts(@Param('id', ParseUUIDPipe) id: string, @Query() query: EligibleBillingContactQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.companiesService.listEligibleBillingContacts(id, query, actor);
  }

  @Patch(':id/billing-contact')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Set or clear the designated commercial Billing Contact' })
  @ApiOkResponse({ type: BillingContactResponseDto })
  updateBillingContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBillingContactDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.companiesService.updateBillingContact(id, dto, actor);
  }

  @Get(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN, RoleName.HR)
  @ApiOperation({ summary: 'Get an accessible company' })
  @ApiOkResponse({ type: CompanyResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update an accessible company' })
  @ApiOkResponse({ type: CompanyResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Archive a company without deleting tenant data (super admin)' })
  @ApiOkResponse({ type: CompanyResponseDto })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.remove(id, user);
  }
}
