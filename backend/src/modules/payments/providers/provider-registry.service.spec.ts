import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentProviderMode, PaymentProviderType } from '@prisma/client';
import { ProviderRegistryService } from './provider-registry.service';
import { RazorpayProvider } from './razorpay.provider';

describe('ProviderRegistryService', () => {
  it('resolves a registered provider without network operations', async () => {
    const registry = new ProviderRegistryService(); registry.register(new RazorpayProvider());
    const adapter = registry.resolve(PaymentProviderType.RAZORPAY);
    const material = registry.normalizeCredentialInput(PaymentProviderType.RAZORPAY, PaymentProviderMode.TEST, { keyId: 'rzp_test_public', keySecret: 'secret', webhookSecret: 'webhook' });
    assert.equal(adapter.type, PaymentProviderType.RAZORPAY);
    assert.deepEqual(await adapter.testConnection(material), { success: true, category: 'STRUCTURAL_VALIDATION_ONLY' });
  });

  it('fails closed for unknown adapters and malformed credentials', () => {
    assert.throws(() => new ProviderRegistryService().resolve(PaymentProviderType.RAZORPAY), ServiceUnavailableException);
    const registry = new ProviderRegistryService(); registry.register(new RazorpayProvider());
    assert.throws(() => registry.normalizeCredentialInput(PaymentProviderType.RAZORPAY, PaymentProviderMode.TEST, { keyId: 'bad', keySecret: 'secret', webhookSecret: 'webhook' }), BadRequestException);
  });
});
