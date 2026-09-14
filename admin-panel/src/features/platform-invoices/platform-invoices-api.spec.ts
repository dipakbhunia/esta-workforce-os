import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get, post } }));

import * as api from './platform-invoices-api';

describe('platform invoices API', () => {
  beforeEach(() => { get.mockReset().mockResolvedValue({ data: {} }); post.mockReset().mockResolvedValue({ data: {} }); });

  it('sends only supported defined list parameters', async () => {
    const query = { page: 2, limit: 50, companyId: 'company', subscriptionId: 'subscription', sourcePaymentId: 'payment', invoiceNumber: 'INV-1', from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' };
    await api.listPlatformInvoices({ ...query, search: 'unsupported', status: 'PAID' } as never);
    expect(get).toHaveBeenCalledWith('/platform/invoices', { params: query });
  });

  it('omits empty optional filters and preserves page and limit', async () => {
    await api.listPlatformInvoices({ page: 1, limit: 20, companyId: undefined, invoiceNumber: '' });
    expect(get).toHaveBeenCalledWith('/platform/invoices', { params: { page: 1, limit: 20 } });
  });

  it('uses the exact details path and issue body', async () => {
    await api.getPlatformInvoice('invoice-id');
    await api.issuePlatformInvoice({ paymentId: 'payment-id' });
    expect(get).toHaveBeenCalledWith('/platform/invoices/invoice-id');
    expect(post).toHaveBeenCalledWith('/platform/invoices', { paymentId: 'payment-id' });
  });

  it('does not coerce monetary response strings', async () => {
    const response = { totalMinor: '9007199254740991', subtotalMinor: '9007199254740991' };
    get.mockResolvedValueOnce({ data: response });
    const result = await api.getPlatformInvoice('invoice-id');
    expect(result.data).toBe(response);
    expect(result.data.totalMinor).toBe('9007199254740991');
  });

  it('builds stable feature-specific query keys', () => {
    const query = { page: 1, limit: 20 };
    expect(api.platformInvoiceKeys.list(query)).toEqual(['platform-invoices', 'list', query]);
    expect(api.platformInvoiceKeys.details('invoice-id')).toEqual(['platform-invoices', 'details', 'invoice-id']);
  });
});
