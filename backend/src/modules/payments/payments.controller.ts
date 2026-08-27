import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';
import { PaymentProviderOrdersService } from './payment-provider-orders.service';
import { CreateProviderOrderDto } from './dto/create-provider-order.dto';
import { ProviderOrderResponseDto } from './dto/provider-order-response.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly providerOrders: PaymentProviderOrdersService) {}

  @Post('subscriptions/:subscriptionId')
  @ApiCreatedResponse({ type: PaymentResponseDto })
  create(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body() _dto: CreatePaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.payments.createForSubscription(subscriptionId, actor);
  }

  @Get(':id')
  @ApiOkResponse({ type: PaymentResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.payments.findOne(id, actor);
  }

  @Post(':id/provider-order')
  @ApiCreatedResponse({ type: ProviderOrderResponseDto })
  prepareProviderOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: CreateProviderOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.providerOrders.prepare(id, actor);
  }
}
