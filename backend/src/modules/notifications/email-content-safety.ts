import { EmailCompositionError } from './email-composition.types';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const monitoringAlertPath = /^\/monitoring\/alerts\/([0-9a-f-]+)$/i;

export function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character,
  );
}

export function buildMonitoringAlertDetailsPath(alertId: string): string {
  if (!canonicalUuid.test(alertId)) {
    throw new EmailCompositionError('INVALID_PAYLOAD', 'Monitoring alert identifier is invalid');
  }
  return `/monitoring/alerts/${alertId.toLowerCase()}`;
}

export function assertSafeEmailDetailsPath(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    /%(?:2f|5c|2e)/i.test(value) ||
    value.includes('..')
  ) {
    throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email details path is not approved');
  }
  const match = monitoringAlertPath.exec(value);
  if (!match || !canonicalUuid.test(match[1])) {
    throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email details path is not approved');
  }
  return `/monitoring/alerts/${match[1].toLowerCase()}`;
}
