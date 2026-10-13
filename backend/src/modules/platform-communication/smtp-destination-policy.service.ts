import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resolver } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export interface ApprovedSmtpDestination { hostname: string; address: string; family: 4 | 6 }

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['192.88.99.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10],
  ['ff00::', 8], ['2001:db8::', 32]] as const) blocked.addSubnet(address, prefix, 'ipv6');

@Injectable()
export class SmtpDestinationPolicyService {
  constructor(private readonly config: ConfigService) {}

  async approve(host: string): Promise<ApprovedSmtpDestination> {
    const hostname = this.canonical(host);
    if (!this.allowlist().has(hostname)) throw new ServiceUnavailableException('SMTP destination is not approved');
    const resolver = this.createResolver();
    const timeout = setTimeout(() => resolver.cancel(), 5_000);
    try {
      const [v4, v6] = await Promise.all([
        resolver.resolve4(hostname).catch((error: NodeJS.ErrnoException) => error.code === 'ENODATA' || error.code === 'ENOTFOUND' ? [] : Promise.reject(error)),
        resolver.resolve6(hostname).catch((error: NodeJS.ErrnoException) => error.code === 'ENODATA' || error.code === 'ENOTFOUND' ? [] : Promise.reject(error)),
      ]);
      const addresses = [...new Map([...v4.map((address) => ({ address, family: 4 as const })),
        ...v6.map((address) => ({ address, family: 6 as const }))].map((entry) => [`${entry.family}:${entry.address}`, entry])).values()]
        .sort((a, b) => a.address.localeCompare(b.address));
      if (!addresses.length || addresses.some(({ address, family }) =>
        isIP(address) !== family ||
        (family === 6 && address.toLowerCase().startsWith('::ffff:')) ||
        blocked.check(address, family === 4 ? 'ipv4' : 'ipv6'))) {
        throw new ServiceUnavailableException('SMTP destination is unsafe');
      }
      return { hostname, ...addresses[0] };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('SMTP destination could not be resolved safely');
    } finally { clearTimeout(timeout); }
  }

  protected createResolver(): Pick<Resolver, 'resolve4' | 'resolve6' | 'cancel'> { return new Resolver(); }

  private canonical(value: string): string {
    const host = value.trim().toLowerCase();
    if (!host || host.length > 253 || host.includes('://') || host.includes('@') || /[/:?#\[\]\\]/.test(host) || isIP(host)) {
      throw new ServiceUnavailableException('SMTP destination is invalid');
    }
    const normalized = host.endsWith('.') ? host.slice(0, -1) : host;
    if (normalized.split('.').some((label) => !HOST_LABEL.test(label))) throw new ServiceUnavailableException('SMTP destination is invalid');
    return normalized;
  }

  private allowlist(): Set<string> {
    const configured = this.config.get<string>('SMTP_TEST_ALLOWED_HOSTS') ?? '';
    const hosts = configured.split(',').map((host) => host.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
    return new Set(hosts.filter((host) => !host.includes('*')));
  }
}
