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
import { serializeBigInts } from '../../common/utils/bigint-response.util';

@ApiTags('Subscriptions') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(RoleName.SUPER_ADMIN)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}
  @Get() async findAll(@Query() query: SubscriptionQueryDto) { return serializeBigInts(await this.subscriptions.findAll(query)); }
  @Post() async create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.create(dto, user)); }
  @Get(':id') async findOne(@Param('id', ParseUUIDPipe) id: string) { return serializeBigInts(await this.subscriptions.findOne(id)); }
  @Post(':id/activate') async activate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActivateSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.activate(id, dto, user)); }
  @Post(':id/suspend') async suspend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.suspend(id, user)); }
  @Post(':id/resume') async resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.resume(id, user)); }
  @Post(':id/cancel') async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.cancel(id, user)); }
  @Post(':id/expire') async expire(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.expire(id, user)); }
  @Post(':id/amend') async amend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AmendSubscriptionDto, @CurrentUser() user: AuthenticatedUser) { return serializeBigInts(await this.subscriptions.amend(id, dto, user)); }
}
