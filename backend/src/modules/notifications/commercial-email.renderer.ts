import { NotificationType } from '@prisma/client';
import { EmailCompositionError, EmailRendererId, type CommercialInvoiceEmailPayload, type CommercialPaymentEmailPayload, type CommercialRenewalBlockedEmailPayload, type CommercialRenewalPeriodEmailPayload, type CommercialSubscriptionActivatedEmailPayload, type CommercialSubscriptionExpiredEmailPayload, type EmailRendererRegistration } from './email-composition.types';

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
const validateActivated = (payload: unknown): CommercialSubscriptionActivatedEmailPayload => {
  exactObject(payload, ['companyName', 'subscriptionReference', 'planName', 'activatedAt', 'periodStart', 'periodEnd']);
  const row = payload as CommercialSubscriptionActivatedEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), subscriptionReference: text(row?.subscriptionReference, 'subscriptionReference'), planName: text(row?.planName, 'planName'), activatedAt: instant(row?.activatedAt, 'activatedAt'), periodStart: instant(row?.periodStart, 'periodStart'), periodEnd: instant(row?.periodEnd, 'periodEnd') };
};
const validateExpired = (payload: unknown): CommercialSubscriptionExpiredEmailPayload => {
  exactObject(payload, ['companyName', 'subscriptionReference', 'expiredAt']);
  const row = payload as CommercialSubscriptionExpiredEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), subscriptionReference: text(row?.subscriptionReference, 'subscriptionReference'), expiredAt: instant(row?.expiredAt, 'expiredAt') };
};
const validateRenewalPeriod = (payload: unknown): CommercialRenewalPeriodEmailPayload => {
  exactObject(payload, ['companyName', 'renewalReference', 'periodStart', 'periodEnd']);
  const row = payload as CommercialRenewalPeriodEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), renewalReference: text(row?.renewalReference, 'renewalReference'), periodStart: instant(row?.periodStart, 'periodStart'), periodEnd: instant(row?.periodEnd, 'periodEnd') };
};
const validateRenewalBlocked = (payload: unknown): CommercialRenewalBlockedEmailPayload => {
  exactObject(payload, ['companyName', 'renewalReference', 'blockedReason']);
  const row = payload as CommercialRenewalBlockedEmailPayload;
  return { companyName: text(row?.companyName, 'companyName'), renewalReference: text(row?.renewalReference, 'renewalReference'), blockedReason: text(row?.blockedReason, 'blockedReason', 500) };
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
  {
    event: NotificationType.SUBSCRIPTION_ACTIVATED, rendererId: EmailRendererId.COMMERCIAL_SUBSCRIPTION, rendererVersion: 'commercial-subscription-v1', envelope,
    validatePayload: validateActivated,
    render: (_type, payload) => ({ subject: `Subscription activated — ${payload.companyName}`, message: `Subscription: ${payload.subscriptionReference}\nPlan: ${payload.planName}\nStatus: ACTIVE\nActivation date: ${payload.activatedAt}\nPeriod: ${payload.periodStart} to ${payload.periodEnd}`, safeDetailsPath: null, rendererVersion: 'commercial-subscription-v1' }),
  } satisfies EmailRendererRegistration<typeof NotificationType.SUBSCRIPTION_ACTIVATED>,
  {
    event: NotificationType.SUBSCRIPTION_EXPIRED, rendererId: EmailRendererId.COMMERCIAL_SUBSCRIPTION, rendererVersion: 'commercial-subscription-v1', envelope,
    validatePayload: validateExpired,
    render: (_type, payload) => ({ subject: `Subscription expired — ${payload.companyName}`, message: `Subscription: ${payload.subscriptionReference}\nStatus: EXPIRED\nExpiration date: ${payload.expiredAt}`, safeDetailsPath: null, rendererVersion: 'commercial-subscription-v1' }),
  } satisfies EmailRendererRegistration<typeof NotificationType.SUBSCRIPTION_EXPIRED>,
  ...([NotificationType.RENEWAL_APPLIED, NotificationType.RENEWAL_PREPARED] as const).map((event): EmailRendererRegistration<typeof event> => ({
    event, rendererId: EmailRendererId.COMMERCIAL_RENEWAL, rendererVersion: 'commercial-renewal-v1', envelope,
    validatePayload: validateRenewalPeriod,
    render: (type, payload) => ({ subject: `${type === NotificationType.RENEWAL_APPLIED ? 'Renewal applied' : 'Renewal prepared'} — ${payload.companyName}`, message: `Renewal: ${payload.renewalReference}\nStatus: ${type === NotificationType.RENEWAL_APPLIED ? 'APPLIED' : 'PREPARED'}\nPeriod: ${payload.periodStart} to ${payload.periodEnd}${type === NotificationType.RENEWAL_PREPARED ? '\nThis is an informational notice for the prepared renewal.' : ''}`, safeDetailsPath: null, rendererVersion: 'commercial-renewal-v1' }),
  })),
  {
    event: NotificationType.RENEWAL_BLOCKED, rendererId: EmailRendererId.COMMERCIAL_RENEWAL, rendererVersion: 'commercial-renewal-v1', envelope,
    validatePayload: validateRenewalBlocked,
    render: (_type, payload) => ({ subject: `Renewal blocked — ${payload.companyName}`, message: `Renewal: ${payload.renewalReference}\nStatus: BLOCKED\nReason: ${payload.blockedReason}\nPlease review the billing configuration or contact support.`, safeDetailsPath: null, rendererVersion: 'commercial-renewal-v1' }),
  } satisfies EmailRendererRegistration<typeof NotificationType.RENEWAL_BLOCKED>,
];
