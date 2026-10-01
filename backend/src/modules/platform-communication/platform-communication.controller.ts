import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformEmailDeliveryQueryDto } from './dto/platform-email-delivery-query.dto';
import { PlatformEmailCapabilityResponseDto, PlatformEmailDeliveryListResponseDto, PlatformEmailDeliveryResponseDto } from './dto/platform-email-delivery-response.dto';
import { PlatformCommunicationService } from './platform-communication.service';

@ApiTags('Platform Communication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('platform-communication')
export class PlatformCommunicationController {
  constructor(private readonly service: PlatformCommunicationService) {}

  @Get('email-capability')
  @ApiOkResponse({ type: PlatformEmailCapabilityResponseDto })
  capability() { return this.service.capability(); }

  @Get('email-deliveries')
  @ApiOkResponse({ type: PlatformEmailDeliveryListResponseDto })
  findDeliveries(@Query() query: PlatformEmailDeliveryQueryDto) { return this.service.findDeliveries(query); }

  @Get('email-deliveries/:id')
  @ApiOkResponse({ type: PlatformEmailDeliveryResponseDto })
  findDelivery(@Param('id', ParseUUIDPipe) id: string) { return this.service.findDelivery(id); }
}
