import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { platformAuditError } from './platform-access-errors';

describe('platformAuditError', () => {
  it.each([[400, 'invalid'], [401, 'expired'], [403, 'restricted'], [404, 'no longer exists']])('maps HTTP %s without exposing payloads', (status, text) => { const headers = new axios.AxiosHeaders(); const error = new axios.AxiosError('raw secret', undefined, undefined, undefined, { status, data: { message: 'internal secret' }, headers, config: { headers }, statusText: '' }); expect(platformAuditError(error, 'fallback')).toMatch(new RegExp(text, 'i')); expect(platformAuditError(error, 'fallback')).not.toContain('secret'); });
  it('uses the safe fallback for unknown failures', () => { expect(platformAuditError(new Error('secret'), 'Safe failure')).toBe('Safe failure'); });
});
