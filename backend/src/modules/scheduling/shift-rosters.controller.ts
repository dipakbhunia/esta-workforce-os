import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  BulkUpsertShiftRosterDaysDto,
  CreateShiftRosterPeriodDto,
  RosterPreviewResponseDto,
  ShiftRosterDayListResponseDto,
  ShiftRosterDayQueryDto,
  ShiftRosterPeriodListResponseDto,
  ShiftRosterPeriodQueryDto,
  UpdateShiftRosterPeriodDto,
  UpsertShiftRosterDayDto,
} from './dto/scheduling.dto';
import { ShiftRostersService } from './shift-rosters.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Shift Rosters')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('shift-rosters')
export class ShiftRostersController {
  constructor(private readonly service: ShiftRostersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft shift roster period' })
  create(@Body() dto: CreateShiftRosterPeriodDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List shift roster periods' })
  @ApiOkResponse({ type: ShiftRosterPeriodListResponseDto })
  findAll(@Query() query: ShiftRosterPeriodQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export filtered shift roster periods as CSV',
    description: 'Exports all matching roster periods up to 10,000 rows. Narrow filters if the result is larger.',
  })
  @ApiProduces('text/csv')
  async exportRosters(
    @Query() query: ShiftRosterPeriodQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.exportRosters(query, user);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }

  @Get(':id/days/export')
  @ApiOperation({
    summary: 'Export filtered shift roster days as CSV',
    description: 'Exports all matching roster days up to 10,000 rows. Narrow filters if the result is larger.',
  })
  @ApiProduces('text/csv')
  async exportRosterDays(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ShiftRosterDayQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const report = await this.service.exportRosterDays(id, query, user);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get shift roster period details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft or published shift roster period' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShiftRosterPeriodDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Get(':id/days')
  @ApiOperation({ summary: 'List roster days for a period' })
  @ApiOkResponse({ type: ShiftRosterDayListResponseDto })
  days(@Param('id', ParseUUIDPipe) id: string, @Query() query: ShiftRosterDayQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.days(id, query, user);
  }

  @Post(':id/days')
  @ApiOperation({ summary: 'Add or update one roster day' })
  upsertDay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertShiftRosterDayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.upsertDay(id, dto, user);
  }

  @Post(':id/days/bulk')
  @ApiOperation({ summary: 'Bulk add or update roster days' })
  bulkUpsertDays(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BulkUpsertShiftRosterDaysDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.bulkUpsertDays(id, dto, user);
  }

  @Delete(':id/days/:dayId')
  @ApiOperation({ summary: 'Soft delete a roster day' })
  removeDay(@Param('id', ParseUUIDPipe) id: string, @Param('dayId', ParseUUIDPipe) dayId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeDay(id, dayId, user);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Preview roster validation before publishing' })
  @ApiOkResponse({ type: RosterPreviewResponseDto })
  preview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.preview(id, user);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a valid roster period' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.publish(id, user);
  }

  @Post(':id/lock')
  @ApiOperation({ summary: 'Lock a published roster period' })
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.lock(id, user);
  }
}
