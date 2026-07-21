const blockedProtocols = new Set([
  'about:',
  'brave:',
  'chrome:',
  'chrome-extension:',
  'data:',
  'edge:',
  'file:',
  'javascript:',
  'moz-extension:',
  'opera:',
  'view-source:',
]);

const blockedHostnames = new Set([
  'localhost',
  'unknown',
  'browser',
  'chrome',
  'firefox',
  'edge',
  'msedge',
  'brave',
  'opera',
  'electron',
]);

export function normalizeHostnameFromUrl(input: string | null | undefined): string | null {
  const value = input?.trim();
  if (!value || value.length > 2048 || /\s/.test(value)) return null;
  if (value.startsWith('view-source:')) return null;

  let url: URL;
  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
      ? value
      : `https://${value}`;
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (blockedProtocols.has(url.protocol)) return null;
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password) return null;
  return normalizeHostname(url.hostname);
}

export function normalizeHostname(input: string | null | undefined): string | null {
  const value = input?.trim().toLowerCase().replace(/\.$/, '');
  if (!value || value.length > 253) return null;
  if (value.includes('://') || /[/?#@:\s]/.test(value)) return null;
  if (isLoopback(value)) return null;

  const hostname = value.startsWith('www.') ? value.slice(4) : value;
  if (blockedHostnames.has(hostname.replace(/[^a-z0-9]/g, ''))) return null;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)
    ? hostname
    : null;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    /^\[?[a-f0-9:]+\]?$/.test(hostname);
}
