import { Injectable } from '@nestjs/common';
import { ProviderOperationError } from './provider-operation.error';

export interface RazorpayHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  authorization: string;
  body?: Readonly<Record<string, unknown>>;
}

export interface RazorpayHttpResponse {
  status: number;
  body: unknown;
}

export interface RazorpayTransport {
  request(input: RazorpayHttpRequest): Promise<RazorpayHttpResponse>;
}

@Injectable()
export class RazorpayHttpTransport implements RazorpayTransport {
  private readonly timeoutMs = 10_000;

  async request(input: RazorpayHttpRequest): Promise<RazorpayHttpResponse> {
    if (!input.url.startsWith('https://api.razorpay.com/')) {
      throw new ProviderOperationError('DEFINITE_FAILURE', 'PROVIDER_URL_REJECTED', 'Payment provider request was rejected');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(input.url, {
        method: input.method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: input.authorization,
          ...(input.body ? { 'content-type': 'application/json' } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try { body = JSON.parse(text); } catch {
          throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_INVALID_RESPONSE', 'Payment provider response could not be verified');
        }
      }
      return { status: response.status, body };
    } catch (error) {
      if (error instanceof ProviderOperationError) throw error;
      throw new ProviderOperationError('AMBIGUOUS', 'PROVIDER_TRANSPORT_UNKNOWN', 'Payment provider result is unknown');
    } finally {
      clearTimeout(timeout);
    }
  }
}
