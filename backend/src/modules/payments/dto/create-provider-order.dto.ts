import { ApiHideProperty } from '@nestjs/swagger';
import { IsEmpty, IsOptional } from 'class-validator';

export class CreateProviderOrderDto {
  @ApiHideProperty() @IsOptional() @IsEmpty() amountMinor?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() currency?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() provider?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() providerMode?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() providerConfigurationId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() credentialVersionId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() receipt?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() providerOrderId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() companyId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() subscriptionId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty() keyId?: never;
}
