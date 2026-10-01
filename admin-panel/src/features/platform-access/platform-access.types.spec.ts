import { describe, expectTypeOf, it } from 'vitest';
import type { CreatePlatformUserRequest, PlatformAuditRecord, PlatformRole, PlatformUser, PlatformUserMutationResult } from './platform-access.types';

describe('platform access sensitive type contract', () => {
  it('keeps initial password request-only and exposes no credential response fields', () => {
    expectTypeOf<CreatePlatformUserRequest>().toHaveProperty('password');
    expectTypeOf<PlatformUser>().not.toHaveProperty('password');
    expectTypeOf<PlatformUser>().not.toHaveProperty('passwordHash');
    expectTypeOf<PlatformUser>().not.toHaveProperty('token');
    expectTypeOf<PlatformUserMutationResult>().not.toHaveProperty('password');
    expectTypeOf<PlatformUserMutationResult>().not.toHaveProperty('passwordHash');
    expectTypeOf<PlatformUserMutationResult>().not.toHaveProperty('token');
    expectTypeOf<PlatformRole>().not.toHaveProperty('permissionIds');
    expectTypeOf<PlatformAuditRecord>().not.toHaveProperty('metadata');
    expectTypeOf<PlatformAuditRecord>().not.toHaveProperty('passwordHash');
    expectTypeOf<PlatformAuditRecord>().not.toHaveProperty('token');
  });
});
