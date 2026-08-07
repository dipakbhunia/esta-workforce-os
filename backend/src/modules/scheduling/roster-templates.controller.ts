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
  CreateRosterTemplateDto,
  PreviewRosterTemplateDto,
  RosterPreviewResponseDto,
  RosterTemplateListResponseDto,
  RosterTemplateQueryDto,
  UpdateRosterTemplateDto,
} from './dto/scheduling.dto';
import { RosterTemplatesService } from './roster-templates.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Roster Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('roster-templates')
export class RosterTemplatesController {
  constructor(private readonly service: RosterTemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reusable roster template' })
  create(@Body() dto: CreateRosterTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List roster templates' })
  @ApiOkResponse({ type: RosterTemplateListResponseDto })
  findAll(@Query() query: RosterTemplateQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export filtered roster templates as CSV' })
  @ApiProduces('text/csv')
  async exportTemplates(@Query() query: RosterTemplateQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const report = await this.service.exportTemplates(query, user);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get roster template details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a roster template' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRosterTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a roster template' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Preview a roster template over a date range' })
  @ApiOkResponse({ type: RosterPreviewResponseDto })
  preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewRosterTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.preview(id, dto, user);
  }
}
