import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePlanDto, PlanQueryDto, UpdatePlanDto, UpdatePlanStatusDto } from './dto/plan.dto';
import { PlanPaginatedResponseDto, PlanResponseDto } from './dto/plan-response.dto';
import { PlansService } from './plans.service';

@ApiTags('Plans') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN)
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}
  @Get('entitlement-catalog') @ApiOkResponse({ isArray: true }) entitlementCatalog() { return this.plans.entitlementCatalog(); }
  @Get() @ApiOkResponse({ type: PlanPaginatedResponseDto }) findAll(@Query() query: PlanQueryDto) { return this.plans.findAll(query); }
  @Post() @ApiCreatedResponse({ type: PlanResponseDto }) create(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthenticatedUser) { return this.plans.create(dto, user); }
  @Get(':id') @ApiOkResponse({ type: PlanResponseDto }) findOne(@Param('id', ParseUUIDPipe) id: string) { return this.plans.findOne(id); }
  @Patch(':id') @ApiOkResponse({ type: PlanResponseDto }) update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: AuthenticatedUser) { return this.plans.update(id, dto, user); }
  @Patch(':id/status') @ApiOkResponse({ type: PlanResponseDto }) updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanStatusDto, @CurrentUser() user: AuthenticatedUser) { return this.plans.updateStatus(id, dto.status, user); }
}
