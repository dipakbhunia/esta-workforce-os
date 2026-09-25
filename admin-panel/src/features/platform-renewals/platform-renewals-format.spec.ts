import { describe, expect, it } from 'vitest';
import { formatPlatformRenewalAmount, formatPlatformRenewalDate } from './platform-renewals-format';
describe('renewal formatting', () => {
  it('formats exact minor-unit strings beyond Number safety', () => expect(formatPlatformRenewalAmount('9007199254740993', 'INR')).toBe('INR 90071992547409.93'));
  it('rejects invalid money and dates safely', () => { expect(formatPlatformRenewalAmount('1.2', 'INR')).toBe('Amount unavailable'); expect(formatPlatformRenewalDate('bad')).toBe('Date unavailable'); });
});
