import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

interface SignedRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Buffer;
}

@Injectable()
export class MinioObjectStorageService {
  private readonly endpoint: URL;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly region: string;
  private readonly bucket: string;
  private bucketReady = false;

  constructor(config: ConfigService) {
    const useSsl = String(config.get<string>('MINIO_USE_SSL') ?? 'false') === 'true';
    const host = config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = config.get<string>('MINIO_API_PORT') ?? '9000';
    const base = /^https?:\/\//.test(host)
      ? host
      : `${useSsl ? 'https' : 'http'}://${host}:${port}`;
    this.endpoint = new URL(base);
    this.accessKey =
      config.get<string>('MINIO_ACCESS_KEY') ??
      config.get<string>('MINIO_ROOT_USER') ??
      '';
    this.secretKey =
      config.get<string>('MINIO_SECRET_KEY') ??
      config.get<string>('MINIO_ROOT_PASSWORD') ??
      '';
    this.region = config.get<string>('MINIO_REGION') ?? 'us-east-1';
    this.bucket = config.get<string>('MINIO_SCREENSHOTS_BUCKET') ?? 'esta-screenshots';
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    const response = await this.fetchSigned({
      method: 'PUT',
      path: `/${this.bucket}/${this.encodeKey(key)}`,
      headers: {
        'content-type': contentType,
        'content-length': String(body.byteLength),
      },
      body,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Screenshot storage upload failed');
    }
  }

  async signedGetUrl(key: string, expiresSeconds = 300): Promise<string> {
    await this.ensureBucket();
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const path = `/${this.bucket}/${this.encodeKey(key)}`;
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const canonicalRequest = [
      'GET',
      path,
      this.canonicalQuery(query),
      `host:${this.endpoint.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');
    const signature = createHmac('sha256', this.signingKey(dateStamp))
      .update(stringToSign)
      .digest('hex');
    const url = new URL(path, this.endpoint);
    url.search = this.canonicalQuery({ ...query, 'X-Amz-Signature': signature });
    return url.toString();
  }

  async objectExists(key: string): Promise<boolean> {
    await this.ensureBucket();
    const response = await this.fetchSigned({
      method: 'HEAD',
      path: `/${this.bucket}/${this.encodeKey(key)}`,
    });
    return response.ok;
  }

  async deleteObject(key: string): Promise<void> {
    await this.ensureBucket();
    const response = await this.fetchSigned({
      method: 'DELETE',
      path: `/${this.bucket}/${this.encodeKey(key)}`,
    });
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException('Screenshot storage cleanup failed');
    }
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    if (!this.accessKey || !this.secretKey) {
      throw new ServiceUnavailableException('Screenshot storage is not configured');
    }
    const head = await this.fetchSigned({
      method: 'HEAD',
      path: `/${this.bucket}`,
    });
    if (head.ok) {
      this.bucketReady = true;
      return;
    }
    const create = await this.fetchSigned({
      method: 'PUT',
      path: `/${this.bucket}`,
      body: Buffer.alloc(0),
    });
    if (!create.ok && create.status !== 409) {
      throw new ServiceUnavailableException('Screenshot storage bucket is unavailable');
    }
    this.bucketReady = true;
  }

  private async fetchSigned(request: SignedRequest): Promise<Response> {
    const body = request.body ?? Buffer.alloc(0);
    const payloadHash = this.sha256(body);
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      host: this.endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(request.headers ?? {}),
    };
    const signedHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaders
      .map((key) => `${key}:${headers[key] ?? headers[Object.keys(headers).find((header) => header.toLowerCase() === key) ?? key]}`)
      .join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalRequest = [
      request.method,
      request.path,
      this.canonicalQuery(request.query ?? {}),
      `${canonicalHeaders}\n`,
      signedHeaders.join(';'),
      payloadHash,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');
    const signature = createHmac('sha256', this.signingKey(dateStamp))
      .update(stringToSign)
      .digest('hex');
    const url = new URL(request.path, this.endpoint);
    url.search = this.canonicalQuery(request.query ?? {});
    return fetch(url, {
      method: request.method,
      headers: {
        ...headers,
        Authorization:
          `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
      },
      body: request.method === 'HEAD' ? undefined : (body as unknown as BodyInit),
    });
  }

  private canonicalQuery(query: Record<string, string>): string {
    return Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  private encodeKey(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
  }

  private sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private signingKey(dateStamp: string): Buffer {
    const dateKey = createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const regionKey = createHmac('sha256', dateKey).update(this.region).digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    return createHmac('sha256', serviceKey).update('aws4_request').digest();
  }

  private amzDate(date: Date): string {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }
}
