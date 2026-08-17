import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivateSubscriptionDto, AmendSubscriptionDto, CreateSubscriptionDto, SubscriptionQueryDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Get() findAll(@Query() query: SubscriptionQueryDto) { return this.subscriptions.findAll(query); }
  @Post() create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.create(dto, user); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.subscriptions.findOne(id); }
  @Post(':id/activate') activate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.activate(id, dto, user); }
  @Post(':id/suspend') suspend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.suspend(id, user); }
  @Post(':id/resume') resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.resume(id, user); }
  @Post(':id/cancel') cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.cancel(id, user); }
  @Post(':id/expire') expire(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.expire(id, user); }
  @Post(':id/amend') amend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmendSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return this.subscriptions.amend(id, dto, user); }
}
