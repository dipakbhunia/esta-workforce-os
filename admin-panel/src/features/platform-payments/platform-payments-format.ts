const DECIMAL_MINOR_UNITS = /^\d+$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

export function formatPlatformPaymentAmount(amountMinor: string, currency: string) {
  if (!DECIMAL_MINOR_UNITS.test(amountMinor) || !CURRENCY_CODE.test(currency)) return 'Amount unavailable';
  const amount = BigInt(amountMinor);
  const major = amount / 100n;
  const minor = (amount % 100n).toString().padStart(2, '0');
  return `${currency} ${major}.${minor}`;
}
