import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './auth.controller';

describe('AuthController email-verification routes', () => {
  it('requires authenticated SUPER_ADMIN authority for request and status only', () => {
    const prototype = AuthController.prototype;
    for (const method of [prototype.requestEmailVerification, prototype.emailVerificationStatus]) {
      assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, method), [JwtAuthGuard, RolesGuard]);
      assert.deepEqual(Reflect.getMetadata(ROLES_KEY, method), [RoleName.SUPER_ADMIN]);
    }
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.requestEmailVerification), 'email-verification/request');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.emailVerificationStatus), 'email-verification/status');
    assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.verifyEmail), 'verify-email');
    assert.equal(Reflect.getMetadata(GUARDS_METADATA, prototype.verifyEmail), undefined);
  });
});
