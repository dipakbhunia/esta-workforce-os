import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PlatformRenewalQueryDto } from './dto/platform-renewal-query.dto';
import { PlatformRenewalsService } from './platform-renewals.service';

@ApiTags('Platform Renewals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform/renewals')
export class PlatformRenewalsController {
  constructor(private readonly renewals: PlatformRenewalsService) {}

  @Get()
  findAll(@Query() query: PlatformRenewalQueryDto) { return this.renewals.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.renewals.findOne(id); }

  @Post('subscriptions/:subscriptionId/prepare')
  @HttpCode(HttpStatus.OK)
  prepare(@Param('subscriptionId', ParseUUIDPipe) subscriptionId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.renewals.prepare(subscriptionId, actor.id);
  }

  @Post(':id/recover')
  @HttpCode(HttpStatus.OK)
  recover(@Param('id', ParseUUIDPipe) id: string) { return this.renewals.recover(id); }
}
