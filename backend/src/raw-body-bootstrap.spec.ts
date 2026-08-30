import assert from 'node:assert/strict';
import { Body, Controller, INestApplication, Module, Post, Req, ValidationPipe } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { IsString } from 'class-validator';
import { after, before, describe, it } from 'node:test';

class ProbeDto { @IsString() value!: string; }
@Controller('probe')
class ProbeController {
  @Post() receive(@Body() dto: ProbeDto, @Req() request: RawBodyRequest<Request>) { return { value: dto.value, raw: request.rawBody?.toString('utf8') }; }
}
Reflect.defineMetadata('design:paramtypes', [ProbeDto, Object], ProbeController.prototype, 'receive');
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Nest raw-body bootstrap regression', () => {
  let app: INestApplication; let baseUrl: string;
  before(async () => {
    const expressApp = await NestFactory.create<NestExpressApplication>(ProbeModule, { rawBody: true, logger: false });
    expressApp.useBodyParser('json', { limit: '256kb' });
    expressApp.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await expressApp.listen(0, '127.0.0.1'); app = expressApp;
    const address = expressApp.getHttpServer().address() as { port: number }; baseUrl = `http://127.0.0.1:${address.port}`;
  });
  after(async () => app.close());

  it('preserves exact raw JSON bytes while normal DTO parsing remains active', async () => {
    const raw = '{ "value" : "ok" }';
    const response = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
    assert.equal(response.status, 201); assert.deepEqual(await response.json(), { value: 'ok', raw });
  });

  it('preserves the global validation policy', async () => {
    const response = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'ok', unexpected: true }) });
    assert.equal(response.status, 400);
  });

  it('accepts JSON above the framework default while enforcing the configured 256 KiB ceiling', async () => {
    const accepted = JSON.stringify({ value: 'x'.repeat(128 * 1024) });
    const acceptedResponse = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: accepted });
    assert.equal(acceptedResponse.status, 201);
    const rejected = JSON.stringify({ value: 'x'.repeat(256 * 1024) });
    const rejectedResponse = await fetch(`${baseUrl}/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rejected });
    assert.equal(rejectedResponse.status, 413);
  });
});
