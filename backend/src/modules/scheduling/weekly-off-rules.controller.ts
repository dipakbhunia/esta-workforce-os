import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateWeeklyOffRuleDto, UpdateWeeklyOffRuleDto, WeeklyOffRuleQueryDto } from './dto/scheduling.dto';
import { WeeklyOffRulesService } from './weekly-off-rules.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Weekly Off Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('weekly-off-rules')
export class WeeklyOffRulesController {
  constructor(private readonly service: WeeklyOffRulesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a weekly off rule' })
  create(@Body() dto: CreateWeeklyOffRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List weekly off rules' })
  findAll(@Query() query: WeeklyOffRuleQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get weekly off rule details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a weekly off rule' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWeeklyOffRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a weekly off rule' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }
}
