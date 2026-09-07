import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformPaymentQueryDto } from './dto/platform-payment-query.dto';
import { PlatformPaymentsService } from './platform-payments.service';

@ApiTags('Platform Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform-payments')
export class PlatformPaymentsController {
  constructor(private readonly platformPayments: PlatformPaymentsService) {}

  @Get()
  findAll(@Query() query: PlatformPaymentQueryDto) {
    return this.platformPayments.findAll(query);
  }
}
