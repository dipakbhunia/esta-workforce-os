import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformAccessController } from './platform-access.controller';
import { CreatePlatformUserDto } from './dto/platform-access.dto';

describe('PlatformAccessController', () => {
  it('exposes the dedicated SUPER_ADMIN platform authority', () => {
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, PlatformAccessController),
      'platform/access',
    );
    assert.deepEqual(
      Reflect.getMetadata(ROLES_KEY, PlatformAccessController),
      [RoleName.SUPER_ADMIN],
    );
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, PlatformAccessController),
      [JwtAuthGuard, RolesGuard],
    );
    assert.equal(
      Reflect.getMetadata(
        METHOD_METADATA,
        PlatformAccessController.prototype.listUsers,
      ),
      RequestMethod.GET,
    );
    assert.equal(
      Reflect.getMetadata(
        PATH_METADATA,
        PlatformAccessController.prototype.setStatus,
      ),
      'users/:id/status',
    );
  });

  it('allows SUPER_ADMIN and denies tenant or missing identities', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (roles?: RoleName[]) =>
      ({
        getHandler: () => PlatformAccessController.prototype.listUsers,
        getClass: () => PlatformAccessController,
        switchToHttp: () => ({
          getRequest: () => ({ user: roles ? { roles } : undefined }),
        }),
      }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(
      () => guard.canActivate(context([RoleName.COMPANY_ADMIN])),
      ForbiddenException,
    );
    assert.throws(() => guard.canActivate(context()), ForbiddenException);
  });

  it('rejects injected company and credential-internal mutation fields', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const valid = {
      email: 'platform@example.invalid',
      password: 'safe-test-password',
      firstName: 'Platform',
      lastName: 'Admin',
      roleIds: ['11111111-1111-4111-8111-111111111111'],
    };
    for (const field of ['companyId', 'passwordHash', 'tokenHash']) {
      await assert.rejects(
        () =>
          pipe.transform(
            { ...valid, [field]: 'forbidden' },
            { type: 'body', metatype: CreatePlatformUserDto },
          ),
        BadRequestException,
      );
    }
  });
});
