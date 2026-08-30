import { BadRequestException, Controller, Headers, HttpCode, HttpException, HttpStatus, Param, ParseUUIDPipe, Post, Req, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { PaymentProviderType } from '@prisma/client';
import type { Request } from 'express';
import { PaymentProviderEventsService } from './payment-provider-events.service';

const MAX_WEBHOOK_BYTES = 256 * 1024;

@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly events: PaymentProviderEventsService) {}
  @Post(':provider/:configurationId')
  @HttpCode(HttpStatus.OK)
  async receive(@Param('provider') providerRoute: string, @Param('configurationId', ParseUUIDPipe) configurationId: string,
    @Headers('content-type') contentType: string | undefined, @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') providerEventId: string | undefined, @Req() request: RawBodyRequest<Request>) {
    if (!this.isJsonContentType(contentType)) throw new UnsupportedMediaTypeException('Webhook content type is unsupported');
    if (!request.rawBody) throw new BadRequestException('Webhook body is unavailable');
    if (request.rawBody.length > MAX_WEBHOOK_BYTES) throw new HttpException('Webhook payload is too large', HttpStatus.PAYLOAD_TOO_LARGE);
    if (!signature) throw new UnauthorizedException('Webhook verification failed');
    const provider = Object.values(PaymentProviderType).find((value) => value.toLowerCase() === providerRoute.toLowerCase());
    if (!provider) throw new BadRequestException('Webhook provider is unsupported');
    const result = await this.events.ingest(provider, configurationId, request.rawBody, signature, providerEventId);
    if (!result.accepted) throw new UnauthorizedException('Webhook verification failed');
    return { received: true, eventId: result.eventId };
  }
  private isJsonContentType(value: string | undefined): boolean {
    if (!value) return false;
    const [mediaType, ...parameters] = value.split(';').map((part) => part.trim());
    if (mediaType.toLowerCase() !== 'application/json') return false;
    return parameters.every((parameter) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\s*=\s*(?:"[^"\r\n]*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+)$/.test(parameter));
  }
}
