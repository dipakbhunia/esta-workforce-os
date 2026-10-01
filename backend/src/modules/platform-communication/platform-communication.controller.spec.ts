import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NotificationStatus, NotificationType, RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformEmailDeliveryQueryDto } from './dto/platform-email-delivery-query.dto';
import { PlatformCommunicationController } from './platform-communication.controller';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (value: Record<string, unknown>) => pipe.transform(value, { type: 'query', metatype: PlatformEmailDeliveryQueryDto });

describe('PlatformCommunicationController', () => {
  it('is guarded by dedicated SUPER_ADMIN authority', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController), 'platform-communication');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformCommunicationController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformCommunicationController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.capability), 'email-capability');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.findDeliveries), 'email-deliveries');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformCommunicationController.prototype.findDelivery), 'email-deliveries/:id');
    const guard = new RolesGuard(new Reflector());
    const context = (roles: RoleName[]) => ({ getHandler: () => PlatformCommunicationController.prototype.findDeliveries,
      getClass: () => PlatformCommunicationController, switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }) }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
  });

  it('accepts only locked filters and normalizes an exact recipient', async () => {
    const dto = await validate({ page: '1', limit: '100', status: NotificationStatus.PENDING,
      companyId: '00000000-0000-4000-8000-000000000001', recipient: ' Person@Example.COM ',
      eventType: NotificationType.ALERT_OPENED, from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    assert.equal(dto.recipient, 'person@example.com');
    assert.equal(dto.limit, 100);
    for (const input of [{ page: '0' }, { limit: '101' }, { companyId: 'bad' }, { recipient: 'bad' },
      { status: 'UNKNOWN' }, { eventType: 'UNKNOWN' }, { channel: 'EMAIL' },
      { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }, { from: 'not-a-date' }]) {
      await assert.rejects(() => validate(input), BadRequestException);
    }
  });

  it('uses established malformed UUID rejection semantics', async () => {
    await assert.rejects(() => new ParseUUIDPipe().transform('bad', { type: 'param', data: 'id' }), BadRequestException);
  });
});
