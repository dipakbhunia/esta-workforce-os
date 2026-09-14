import { describe, expect, it } from 'vitest';
import { formatPlatformInvoiceAmount, formatPlatformInvoiceDate } from './platform-invoices-format';

describe('platform invoice formatting', () => {
  it.each([
    ['0', 'INR 0.00'], ['1', 'INR 0.01'], ['99000', 'INR 990.00'],
    ['9007199254740991', 'INR 90071992547409.91'],
  ])('formats exact minor units %s', (value, expected) => expect(formatPlatformInvoiceAmount(value, 'INR')).toBe(expected));

  it.each([[''], ['1.2'], ['-1'], ['text'], [null], [undefined]])('rejects invalid amount %j', (value) => {
    expect(formatPlatformInvoiceAmount(value, 'INR')).toBe('Amount unavailable');
  });

  it('rejects invalid currency codes', () => expect(formatPlatformInvoiceAmount('100', 'inr')).toBe('Amount unavailable'));

  it('handles valid, invalid, and absent timestamps defensively', () => {
    expect(formatPlatformInvoiceDate('2026-09-01T00:00:00.000Z')).not.toMatch(/unavailable/i);
    expect(formatPlatformInvoiceDate('not-a-date')).toBe('Date unavailable');
    expect(formatPlatformInvoiceDate(null)).toBe('Not available');
  });
});
