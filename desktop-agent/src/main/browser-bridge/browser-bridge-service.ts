import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { BrowserBridgePairingInfo, BrowserBridgeState } from '../../shared/contracts';

const maxBodyBytes = 2048;
const pairingTtlMs = 8 * 60 * 60 * 1000;
const staleStateMs = 2 * 60 * 1000;
const rateLimitWindowMs = 10000;
const maxRequestsPerWindow = 120;
const forbiddenPayloadKeys = new Set([
  'url',
  'path',
  'query',
  'title',
  'pagecontent',
  'cookie',
  'cookies',
  'history',
  'typedtext',
  'text',
  'formvalue',
  'formvalues',
  'clipboard',
]);

interface BrowserBridgePayload {
  hostname?: unknown;
  observedAt?: unknown;
  browser?: unknown;
}

export class BrowserBridgeService {
  private server: Server | null = null;
  private port: number | null = null;
  private token = randomBytes(32).toString('base64url');
  private expiresAt = new Date(Date.now() + pairingTtlMs);
  private latestState: BrowserBridgeState | null = null;
  private windowStartedAt = Date.now();
  private requestCount = 0;

  async start(): Promise<void> {
    if (this.server) return;
    await new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handleRequest(request, response);
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Browser bridge did not receive a TCP port'));
          return;
        }
        this.server = server;
        this.port = address.port;
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Esta Desktop] Browser bridge started', {
            host: '127.0.0.1',
            port: this.port,
            expiresAt: this.expiresAt.toISOString(),
          });
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  getPairingInfo(): BrowserBridgePairingInfo | null {
    if (!this.port) return null;
    return {
      host: '127.0.0.1',
      port: this.port,
      token: this.token,
      expiresAt: this.expiresAt.toISOString(),
    };
  }

  regeneratePairingToken(): BrowserBridgePairingInfo | null {
    this.token = randomBytes(32).toString('base64url');
    this.expiresAt = new Date(Date.now() + pairingTtlMs);
    this.latestState = null;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Browser bridge pairing token regenerated', {
        host: '127.0.0.1',
        port: this.port,
        expiresAt: this.expiresAt.toISOString(),
      });
    }
    return this.getPairingInfo();
  }

  getLatestState(): BrowserBridgeState | null {
    if (!this.latestState) return null;
    if (Date.now() - new Date(this.latestState.receivedAt).getTime() > staleStateMs) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[Esta Desktop] Browser bridge hostname ignored because it is stale', {
          browser: this.latestState.browser,
          hostname: this.latestState.hostname,
          observedAt: this.latestState.observedAt,
        });
      }
      return null;
    }
    return this.latestState;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    this.setCorsHeaders(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/status') {
      if (!this.isAllowedOrigin(request.headers.origin)) {
        this.writeJson(response, 403, { error: 'invalid_origin' });
        return;
      }
      if (!this.isAuthorized(request.headers.authorization)) {
        this.writeJson(response, 401, { error: 'unauthorized' });
        return;
      }
      this.writeJson(response, 200, { ok: true });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/browser/active-tab') {
      this.writeJson(response, 404, { error: 'not_found' });
      return;
    }
    if (!this.isAllowedOrigin(request.headers.origin)) {
      this.writeJson(response, 403, { error: 'invalid_origin' });
      return;
    }
    if (!this.isAuthorized(request.headers.authorization)) {
      this.writeJson(response, 401, { error: 'unauthorized' });
      return;
    }
    if (!this.consumeRateLimit()) {
      this.writeJson(response, 429, { error: 'rate_limited' });
      return;
    }

    let body: string;
    try {
      body = await readLimitedBody(request, maxBodyBytes);
    } catch {
      this.writeJson(response, 413, { error: 'payload_too_large' });
      return;
    }

    let parsed: BrowserBridgePayload;
    try {
      parsed = JSON.parse(body) as BrowserBridgePayload;
    } catch {
      this.writeJson(response, 400, { error: 'invalid_json' });
      return;
    }

    const forbiddenKey = this.findForbiddenKey(parsed);
    if (forbiddenKey) {
      this.writeJson(response, 400, { error: 'forbidden_field', field: forbiddenKey });
      return;
    }

    const hostname = typeof parsed.hostname === 'string'
      ? normalizeHostname(parsed.hostname)
      : null;
    const browser = typeof parsed.browser === 'string'
      ? normalizeBrowser(parsed.browser)
      : null;
    const observedAt = typeof parsed.observedAt === 'string' && !Number.isNaN(Date.parse(parsed.observedAt))
      ? new Date(parsed.observedAt)
      : null;
    if (!hostname || !browser || !observedAt) {
      this.writeJson(response, 400, { error: 'invalid_payload' });
      return;
    }

    this.latestState = {
      browser,
      hostname,
      observedAt: observedAt.toISOString(),
      receivedAt: new Date().toISOString(),
      source: 'extension',
    };
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Authenticated browser hostname received', {
        browser,
        hostname,
        observedAt: observedAt.toISOString(),
      });
    }
    this.writeJson(response, 202, { ok: true });
  }

  private setCorsHeaders(request: IncomingMessage, response: ServerResponse): void {
    if (this.isAllowedOrigin(request.headers.origin)) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin as string);
      response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Max-Age', '300');
  }

  private isAllowedOrigin(origin: string | undefined): boolean {
    return typeof origin === 'string' && /^chrome-extension:\/\/[a-z]{32}$/i.test(origin);
  }

  private isAuthorized(header: string | undefined): boolean {
    if (Date.now() > this.expiresAt.getTime()) return false;
    return header === `Bearer ${this.token}`;
  }

  private consumeRateLimit(): boolean {
    const now = Date.now();
    if (now - this.windowStartedAt > rateLimitWindowMs) {
      this.windowStartedAt = now;
      this.requestCount = 0;
    }
    this.requestCount += 1;
    return this.requestCount <= maxRequestsPerWindow;
  }

  private findForbiddenKey(value: unknown, path = 'payload'): string | null {
    if (!value || typeof value !== 'object') return null;
    for (const [key, entry] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nextPath = `${path}.${key}`;
      if (forbiddenPayloadKeys.has(normalized)) return nextPath;
      const nested = this.findForbiddenKey(entry, nextPath);
      if (nested) return nested;
    }
    return null;
  }

  private writeJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }
}

function readLimitedBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > limit) {
        request.destroy();
        reject(new Error('payload_too_large'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function normalizeBrowser(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (['chrome', 'edge', 'brave', 'opera'].includes(normalized)) return normalized;
  return null;
}

function normalizeHostname(value: string): string | null {
  const raw = value.trim().toLowerCase().replace(/\.$/, '');
  if (!raw || raw.length > 253 || raw.includes('://') || /[/?#@:\s]/.test(raw)) return null;
  if (raw === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(raw) || /^\[?[a-f0-9:]+\]?$/.test(raw)) {
    return null;
  }
  const hostname = raw.startsWith('www.') ? raw.slice(4) : raw;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
    ? hostname
    : null;
}
