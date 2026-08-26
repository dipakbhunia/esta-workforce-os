import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentProviderMode,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
} from '@prisma/client';

export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ format: 'uuid' })
  subscriptionId!: string;

  @ApiProperty({ enum: PaymentPurpose })
  purpose!: PaymentPurpose;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiProperty({ enum: PaymentProviderType })
  provider!: PaymentProviderType;

  @ApiProperty({ enum: PaymentProviderMode })
  providerMode!: PaymentProviderMode;

  @ApiProperty({ description: 'Integer minor units serialized as a decimal string', example: '150000' })
  amountMinor!: string;

  @ApiProperty({ example: 'INR' })
  currency!: string;

  @ApiPropertyOptional({ nullable: true })
  providerStatus!: string | null;

  @ApiPropertyOptional({ nullable: true })
  capturedProviderPaymentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  authorizedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  capturedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  failedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
