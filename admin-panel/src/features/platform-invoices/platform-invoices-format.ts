const DECIMAL_MINOR_UNITS = /^\d+$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

export function formatPlatformInvoiceAmount(amountMinor: string | null | undefined, currency: string) {
  if (amountMinor == null || !DECIMAL_MINOR_UNITS.test(amountMinor) || !CURRENCY_CODE.test(currency)) return 'Amount unavailable';
  const amount = BigInt(amountMinor);
  const major = amount / 100n;
  const minor = (amount % 100n).toString().padStart(2, '0');
  return `${currency} ${major}.${minor}`;
}

export function formatPlatformInvoiceDate(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable';
}
