import { http } from '@/services/http';
import type { IssuedPlatformInvoiceResult, IssuePlatformInvoiceRequest, PlatformInvoiceDetails, PlatformInvoiceListQuery, PlatformInvoiceListResponse } from './platform-invoices.types';

const LIST_PARAMETERS = ['page', 'limit', 'companyId', 'subscriptionId', 'sourcePaymentId', 'invoiceNumber', 'from', 'to'] as const;

export const platformInvoiceKeys = {
  all: ['platform-invoices'] as const,
  list: (query: PlatformInvoiceListQuery) => [...platformInvoiceKeys.all, 'list', query] as const,
  details: (invoiceId: string) => [...platformInvoiceKeys.all, 'details', invoiceId] as const,
};

export function listPlatformInvoices(query: PlatformInvoiceListQuery) {
  const params = Object.fromEntries(
    LIST_PARAMETERS.map((key) => [key, query[key]] as const)
      .filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  return http.get<PlatformInvoiceListResponse>('/platform/invoices', { params });
}

export const getPlatformInvoice = (invoiceId: string) =>
  http.get<PlatformInvoiceDetails>(`/platform/invoices/${invoiceId}`);

export const issuePlatformInvoice = ({ paymentId }: IssuePlatformInvoiceRequest) =>
  http.post<IssuedPlatformInvoiceResult>('/platform/invoices', { paymentId });
