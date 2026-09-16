import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GstTaxPolicyStatus, GstTaxTreatment } from '@prisma/client';
import { CreatePlatformGstPolicyDto, PlatformGstTransactionQueryDto } from './platform-gst.dto';

describe('Platform GST DTOs', () => {
  it('validates pagination, paired half-open dates, UUIDs, enums, and unsupported search', async () => {
    const valid = plainToInstance(PlatformGstTransactionQueryDto, { page: '2', limit: '10', from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00+00:00' });
    assert.equal((await validate(valid)).length, 0); assert.equal(valid.page, 2);
    assert.ok((await validate(plainToInstance(PlatformGstTransactionQueryDto, { from: '2026-09-01T00:00:00Z' }))).length);
    assert.ok((await validate(plainToInstance(PlatformGstTransactionQueryDto, { companyId: 'bad', search: 'x' }))).length);
  });
  it('validates append-policy input types', async () => {
    const dto = plainToInstance(CreatePlatformGstPolicyDto, { policyCode: 'SUBSCRIPTION_GST', status: GstTaxPolicyStatus.DRAFT, currency: 'INR', treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900, sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: '9983', effectiveFrom: '2026-10-01T00:00:00Z' });
    assert.equal((await validate(dto)).length, 0);
  });
});
