import axios from 'axios';
export function normalizePlanCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^A-Z]+/, '')
    .slice(0, 50)
    .replace(/_+$/g, '');
}

export function planCodeError(value: string) {
  if (!value) return 'Plan code is required.';
  if (value.length < 2) return 'Plan code must be at least 2 characters.';
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) return 'Use uppercase letters, numbers, and underscores; begin with a letter.';
  return null;
}

export const money = (minor: number | string | null, currency: string) => minor === null ? 'Not configured' : typeof minor === 'string' ? moneyMinorString(minor, currency) : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
export const moneyMinorString = (minor: string, currency: string) => { const amount = BigInt(minor); return `${currency} ${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`; };
export const apiError = (error: unknown, fallback: string) => axios.isAxiosError(error) ? ((error.response?.data as { message?: string | string[] })?.message instanceof Array ? (error.response?.data as { message: string[] }).message.join(', ') : (error.response?.data as { message?: string })?.message) ?? fallback : fallback;
