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
  CreateRotationPatternDto,
  PreviewRotationPatternDto,
  RotationPatternListResponseDto,
  RotationPatternQueryDto,
  UpdateRotationPatternDto,
} from './dto/scheduling.dto';
import { RotationPatternsService } from './rotation-patterns.service';

const schedulingRoles = [RoleName.COMPANY_ADMIN, RoleName.HR];

@ApiTags('Rotation Patterns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...schedulingRoles)
@Controller('rotation-patterns')
export class RotationPatternsController {
  constructor(private readonly service: RotationPatternsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reusable rotation pattern' })
  create(@Body() dto: CreateRotationPatternDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List rotation patterns' })
  @ApiOkResponse({ type: RotationPatternListResponseDto })
  findAll(@Query() query: RotationPatternQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export filtered rotation patterns as CSV' })
  @ApiProduces('text/csv')
  async exportPatterns(@Query() query: RotationPatternQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const report = await this.service.exportPatterns(query, user);
    response.setHeader('Content-Type', report.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    response.send(report.buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get rotation pattern details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a rotation pattern' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRotationPatternDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a rotation pattern' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Preview a rotation pattern over a date range' })
  preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewRotationPatternDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.preview(id, dto, user);
  }
}