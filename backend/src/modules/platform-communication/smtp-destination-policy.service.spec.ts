import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { SmtpDestinationPolicyService } from './smtp-destination-policy.service';

class Policy extends SmtpDestinationPolicyService {
  constructor(allowlist: string, private readonly v4: string[], private readonly v6: string[]) {
    super({ get: () => allowlist } as never);
  }
  protected override createResolver() {
    return { resolve4: async () => this.v4, resolve6: async () => this.v6, cancel: () => undefined };
  }
}

describe('SmtpDestinationPolicyService', () => {
  it('canonicalizes an exact allowlisted hostname and validates all IPv4 and IPv6 results', async () => {
    const result = await new Policy('smtp.example.com', ['8.8.8.8'], []).approve('SMTP.EXAMPLE.COM.');
    assert.equal(result.hostname, 'smtp.example.com');
    assert.equal(result.address, '8.8.8.8');
    const ipv6 = await new Policy('smtp.example.com', [], ['2606:4700:4700::1111']).approve('smtp.example.com');
    assert.equal(ipv6.family, 6);
  });

  it('rejects non-allowlisted, wildcard, malformed, URL, credential, and literal hosts', async () => {
    for (const [allowlist, host] of [['other.example.com', 'smtp.example.com'], ['*.example.com', 'smtp.example.com'],
      ['smtp.example.com', 'smtp://smtp.example.com'], ['smtp.example.com', 'user@smtp.example.com'],
      ['127.0.0.1', '127.0.0.1'], ['::1', '::1']]) {
      await assert.rejects(() => new Policy(allowlist, ['8.8.8.8'], []).approve(host), ServiceUnavailableException);
    }
  });

  it('rejects the entire resolution when any A or AAAA answer is unsafe', async () => {
    for (const addresses of [
      { v4: ['8.8.8.8', '127.0.0.1'], v6: [] }, { v4: ['169.254.169.254'], v6: [] },
      { v4: ['10.0.0.1'], v6: [] }, { v4: [], v6: ['::1'] }, { v4: [], v6: ['fe80::1'] },
      { v4: [], v6: ['fc00::1'] }, { v4: [], v6: ['::ffff:127.0.0.1'] },
    ]) await assert.rejects(() => new Policy('smtp.example.com', addresses.v4, addresses.v6).approve('smtp.example.com'), ServiceUnavailableException);
  });

  it('rejects empty and malformed DNS responses', async () => {
    await assert.rejects(() => new Policy('smtp.example.com', [], []).approve('smtp.example.com'), ServiceUnavailableException);
    await assert.rejects(() => new Policy('smtp.example.com', ['not-an-ip'], []).approve('smtp.example.com'), ServiceUnavailableException);
  });
});
