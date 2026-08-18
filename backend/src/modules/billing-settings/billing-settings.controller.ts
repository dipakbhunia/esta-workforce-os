import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BillingSettingsService } from './billing-settings.service';
import {
  CreateBillingProviderConfigurationDto,
  UpdateBillingProviderConfigurationDto,
  UpdateBillingSettingsDto,
} from './dto/billing-settings.dto';

@ApiTags('Billing Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPER_ADMIN)
@Controller('billing-settings')
export class BillingSettingsController {
  constructor(private readonly billingSettings: BillingSettingsService) {}

  @Get()
  getSettings() {
    return this.billingSettings.getSettings();
  }

  @Patch()
  updateSettings(
    @Body() dto: UpdateBillingSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.updateSettings(dto, actor);
  }

  @Get('providers')
  listProviders() {
    return this.billingSettings.listProviders();
  }

  @Post('providers')
  createProvider(
    @Body() dto: CreateBillingProviderConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.createProvider(dto, actor);
  }

  @Patch('providers/:id')
  updateProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingProviderConfigurationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.updateProvider(id, dto, actor);
  }

  @Post('providers/:id/enable')
  enableProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.enableProvider(id, actor);
  }

  @Post('providers/:id/disable')
  disableProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.disableProvider(id, actor);
  }

  @Post('providers/:id/default')
  setDefaultProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.billingSettings.setDefaultProvider(id, actor);
  }
}
