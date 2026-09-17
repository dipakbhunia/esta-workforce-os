export function formatGstMoney(minor: string, currency: string) {
  if (!/^-?\d+$/.test(minor)) return `${currency} —`;
  const negative = minor.startsWith('-');
  const digits = negative ? minor.slice(1) : minor;
  const padded = digits.padStart(3, '0');
  return `${currency} ${negative ? '-' : ''}${padded.slice(0, -2)}.${padded.slice(-2)}`;
}
export const formatBasisPoints = (value: number) => `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}%`;
export const formatGstDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No end date';
export const labelGst = (value: string) => value.replaceAll('_', ' ');
