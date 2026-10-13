import { NotificationType } from '@prisma/client';
import { findEmailTemplateCatalogEntry } from './email-template-catalog';

const syntheticValues = Object.freeze<Record<string, string>>({
  alertId: '00000000-0000-4000-8000-000000000101',
  title: 'Unusual activity detected',
  message: 'A sample monitoring event requires review.',
  severity: 'WARNING',
  employeeDisplayName: 'Sample Employee',
  deviceDisplayName: 'Sample Workstation',
  previousStatus: 'ACTIVE',
  status: 'SUSPENDED',
  leaveRequestId: '00000000-0000-4000-8000-000000000102',
  leaveTypeName: 'Annual Leave',
  startDate: '2030-01-10',
  endDate: '2030-01-12',
  applicantDisplayName: 'Sample Applicant',
  cancelledByDisplayName: 'Sample Approver',
  attendanceCorrectionRequestId: '00000000-0000-4000-8000-000000000103',
  attendanceDate: '2030-01-10',
  correctionType: 'CHECK_IN',
  organizationName: 'Sample Organization',
  expiresAt: '2030-01-10T12:00:00.000Z',
  companyName: 'Sample Company',
  paymentReference: 'PAY-SAMPLE-001',
  amountMinor: '125000',
  currency: 'INR',
  occurredAt: '2030-01-10T09:30:00.000Z',
  invoiceNumber: 'INV-SAMPLE-001',
  totalMinor: '125000',
  issuedAt: '2030-01-10T09:30:00.000Z',
  dueAt: '2030-01-20T09:30:00.000Z',
  subscriptionReference: 'SUB-SAMPLE-001',
  planName: 'Enterprise',
  activatedAt: '2030-01-10T09:30:00.000Z',
  periodStart: '2030-01-10',
  periodEnd: '2030-02-09',
  expiredAt: '2030-02-10T00:00:00.000Z',
  renewalReference: 'REN-SAMPLE-001',
  blockedReason: 'Sample payment review is required',
});

export function emailTemplateSyntheticValues(type: NotificationType): Readonly<Record<string, string>> {
  const catalog = findEmailTemplateCatalogEntry(type);
  if (!catalog) return Object.freeze({});
  return Object.freeze(Object.fromEntries(catalog.allowedVariables.map((name) => [name, syntheticValues[name]])));
}
