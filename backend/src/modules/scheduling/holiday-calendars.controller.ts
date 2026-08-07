import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateHolidayCalendarDto, CreateHolidayDto, HolidayCalendarListResponseDto, HolidayCalendarQueryDto, HolidayQueryDto, UpdateHolidayCalendarDto, UpdateHolidayDto } from './dto/scheduling.dto';
import { HolidayCalendarsService } from './holiday-calendars.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Holiday Calendars')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('holiday-calendars')
export class HolidayCalendarsController {
  constructor(private readonly service: HolidayCalendarsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a holiday calendar' })
  createCalendar(@Body() dto: CreateHolidayCalendarDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createCalendar(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List holiday calendars' })
  @ApiOkResponse({ type: HolidayCalendarListResponseDto })
  findCalendars(@Query() query: HolidayCalendarQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findCalendars(query, user);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export holiday calendars as CSV' })
  @ApiProduces('text/csv')
  async exportCalendars(@Query() query: HolidayCalendarQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const file = await this.service.exportCalendars(query, user);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get holiday calendar details' })
  findCalendar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findCalendar(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a holiday calendar' })
  updateCalendar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHolidayCalendarDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateCalendar(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a holiday calendar' })
  removeCalendar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeCalendar(id, user);
  }

  @Post(':calendarId/holidays')
  @ApiOperation({ summary: 'Create a holiday in a calendar' })
  createHoliday(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Body() dto: CreateHolidayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createHoliday(calendarId, dto, user);
  }

  @Get(':calendarId/holidays')
  @ApiOperation({ summary: 'List holidays in a calendar' })
  listHolidays(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Query() query: HolidayQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listHolidays(calendarId, query, user);
  }

  @Get(':calendarId/holidays/export')
  @ApiOperation({ summary: 'Export holidays in a calendar as CSV' })
  @ApiProduces('text/csv')
  async exportHolidays(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Query() query: HolidayQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const file = await this.service.exportHolidays(calendarId, query, user);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Get(':calendarId/holidays/:holidayId')
  @ApiOperation({ summary: 'Get holiday details' })
  findHoliday(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Param('holidayId', ParseUUIDPipe) holidayId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findHoliday(calendarId, holidayId, user);
  }

  @Patch(':calendarId/holidays/:holidayId')
  @ApiOperation({ summary: 'Update a holiday' })
  updateHoliday(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Param('holidayId', ParseUUIDPipe) holidayId: string, @Body() dto: UpdateHolidayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateHoliday(calendarId, holidayId, dto, user);
  }

  @Delete(':calendarId/holidays/:holidayId')
  @ApiOperation({ summary: 'Soft delete a holiday' })
  removeHoliday(@Param('calendarId', ParseUUIDPipe) calendarId: string, @Param('holidayId', ParseUUIDPipe) holidayId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeHoliday(calendarId, holidayId, user);
  }
}