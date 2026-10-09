import { NotificationType } from '@prisma/client';
import { EmailCompositionError, EmailRendererId, type CommercialInvoiceEmailPayload, type CommercialPaymentEmailPayload, type EmailRendererRegistration } from './email-composition.types';

const envelope = {
  detailsLabel: 'View billing details',
  textSafetyNotice: 'This is an automated transactional message. No payment link is included.',
  htmlSafetyNotice: 'This is an automated transactional message. No payment link is included.',
};
const text = (value: unknown, name: string, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new EmailCompositionError('INVALID_PAYLOAD', `${name} is invalid`);
  return value.trim();
};
const instant = (value: unknown, name: string) => {
  const result = text(value, name, 40);
  if (!Number.isFinite(new Date(result).getTime())) throw new EmailCompositionError('INVALID_PAYLOAD', `${name} is invalid`);
  return result;
};
const money = (minor: string, currency: string) => {
  if (!/^-?\d+$/.test(minor) || !/^[A-Z]{3}$/.test(currency)) throw new EmailCompositionError('INVALID_PAYLOAD', 'Money is invalid');
  const negative = minor.startsWith('-');
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(3, '0');
  return `${negative ? '-' : ''}${currency} ${padded.slice(0, -2)}.${padded.slice(-2)}`;
};
const exactObject = (payload: unknown, keys: readonly string[]) => {
  if (!payload || typeof payload !== 'object' || Object.getPrototypeOf(payload) !== Object.prototype) throw new EmailCompositionError('INVALID_PAYLOAD', 'Payload is invalid');
  const actual = Object.keys(payload).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new EmailCompositionError('INVALID_PAYLOAD', 'Payload fields are invalid');
};
const validatePayment = (payload: unknown): CommercialPaymentEmailPayload => {
  exactObject(payload, ['companyName', 'paymentReference', 'amountMinor', 'currency', 'occurredAt']);
  const row = payload as CommercialPaymentEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), paymentReference: text(row?.paymentReference, 'paymentReference'), amountMinor: text(row?.amountMinor, 'amountMinor', 30), currency: text(row?.currency, 'currency', 3), occurredAt: instant(row?.occurredAt, 'occurredAt') };
};
const validateInvoice = (payload: unknown): CommercialInvoiceEmailPayload => {
  exactObject(payload, ['companyName', 'invoiceNumber', 'totalMinor', 'currency', 'issuedAt', 'dueAt']);
  const row = payload as CommercialInvoiceEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), invoiceNumber: text(row?.invoiceNumber, 'invoiceNumber'), totalMinor: text(row?.totalMinor, 'totalMinor', 30), currency: text(row?.currency, 'currency', 3), issuedAt: instant(row?.issuedAt, 'issuedAt'), dueAt: row?.dueAt === null ? null : instant(row?.dueAt, 'dueAt') };
};

export const commercialEmailRendererRegistrations = [
  ...([NotificationType.PAYMENT_CAPTURED, NotificationType.PAYMENT_FAILED] as const).map((event): EmailRendererRegistration<typeof event> => ({
    event, rendererId: EmailRendererId.COMMERCIAL_PAYMENT, rendererVersion: 'commercial-payment-v1', envelope,
    validatePayload: validatePayment,
    render: (type, payload) => ({
      subject: type === NotificationType.PAYMENT_CAPTURED ? `Payment captured — ${payload.companyName}` : `Payment failed — ${payload.companyName}`,
      message: `Payment reference: ${payload.paymentReference}\nAmount: ${money(payload.amountMinor, payload.currency)}\nStatus: ${type === NotificationType.PAYMENT_CAPTURED ? 'CAPTURED' : 'FAILED'}\nDate: ${payload.occurredAt}${type === NotificationType.PAYMENT_FAILED ? '\nPlease review your billing arrangements or contact support.' : ''}`,
      safeDetailsPath: null, rendererVersion: 'commercial-payment-v1',
    }),
  })),
  {
    event: NotificationType.INVOICE_ISSUED, rendererId: EmailRendererId.COMMERCIAL_INVOICE, rendererVersion: 'commercial-invoice-v1', envelope,
    validatePayload: validateInvoice,
    render: (_type, payload) => ({ subject: `Invoice ${payload.invoiceNumber} issued — ${payload.companyName}`, message: `Invoice: ${payload.invoiceNumber}\nAmount: ${money(payload.totalMinor, payload.currency)}\nIssue date: ${payload.issuedAt}${payload.dueAt ? `\nDue date: ${payload.dueAt}` : ''}`, safeDetailsPath: null, rendererVersion: 'commercial-invoice-v1' }),
  } satisfies EmailRendererRegistration<typeof NotificationType.INVOICE_ISSUED>,
];
