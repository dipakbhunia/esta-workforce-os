export function subscriptionMoney(amount: number | string | null, currency: string) { if (amount === null) return 'Not configured'; if (typeof amount === 'string') { const minor = BigInt(amount); return `${currency} ${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`; } return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount / 100); }
export function recurringMoney(amount: string | null, currency: string | null) { if (amount === null || currency === null) return 'Commercial pricing unresolved'; const minor = BigInt(amount); return `${currency} ${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`; }
export function recurringPreview(unitAmountMinor: string | null, seats: string | number, basis: 'PER_USER_UNIT' | 'FIXED_TOTAL', currency: string) {
  if (unitAmountMinor === null) return 'Not configured';
  const quantity = typeof seats === 'number' ? BigInt(seats) : /^\d+$/.test(seats) ? BigInt(seats) : 0n;
  const total = basis === 'PER_USER_UNIT' ? BigInt(unitAmountMinor) * quantity : BigInt(unitAmountMinor);
  return subscriptionMoney(total.toString(), currency);
}
export function subscriptionDate(value: string | null) { return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not set'; }
export function subscriptionTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' { if (status === 'ACTIVE') return 'success'; if (status === 'PENDING') return 'warning'; if (status === 'SUSPENDED') return 'danger'; return 'neutral'; }
