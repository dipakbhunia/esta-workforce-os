import { ApiHideProperty } from '@nestjs/swagger';
import { IsEmpty, IsOptional } from 'class-validator';

export class CreatePaymentDto {
  @ApiHideProperty() @IsOptional() @IsEmpty({ message: 'amountMinor is server-controlled' }) amountMinor?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty({ message: 'currency is server-controlled' }) currency?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty({ message: 'companyId is server-controlled' }) companyId?: never;
  @ApiHideProperty() @IsOptional() @IsEmpty({ message: 'providerConfigurationId is server-controlled' }) providerConfigurationId?: never;
}
