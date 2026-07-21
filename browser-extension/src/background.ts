import { sendHostnameToDesktop } from './bridge-client.js';
import { normalizeHostnameFromUrl } from './shared/hostname.js';
import { getPairingConfig } from './storage.js';
import type { SupportedBrowser } from './types.js';

chrome.tabs.onActivated.addListener(() => {
  void publishActiveTab('tab_activated');
});

chrome.tabs.onUpdated.addListener(() => {
  void publishActiveTab('tab_updated');
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void publishActiveTab('window_focused');
});

chrome.runtime.onInstalled.addListener(() => {
  void publishActiveTab('installed');
});

chrome.runtime.onStartup.addListener(() => {
  void publishActiveTab('startup');
});

async function publishActiveTab(reason: string): Promise<void> {
  const config = await getPairingConfig();
  if (!config) {
    devLog('bridge not paired', { reason });
    return;
  }

  const tab = await getActiveTab();
  const hostname = normalizeHostnameFromUrl(tab?.url);
  const browser = await detectBrowser();
  if (!hostname) {
    devLog('hostname rejected or unavailable', { reason, browser });
    return;
  }

  try {
    await sendHostnameToDesktop(config, {
      hostname,
      observedAt: new Date().toISOString(),
      browser,
    });
    devLog('hostname sent', { reason, browser, hostname });
  } catch (error) {
    devLog('bridge unavailable', {
      reason,
      browser,
      hostname,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getActiveTab(): Promise<{ url?: string } | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      resolve(tabs[0] ?? null);
    });
  });
}

async function detectBrowser(): Promise<SupportedBrowser> {
  const braveApi = (navigator as Navigator & {
    brave?: { isBrave?: () => Promise<boolean> };
  }).brave;
  if (braveApi?.isBrave && await braveApi.isBrave()) return 'brave';
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('edg/')) return 'edge';
  if (userAgent.includes('opr/') || userAgent.includes('opera')) return 'opera';
  return 'chrome';
}

function devLog(message: string, data: Record<string, unknown>): void {
  if (!globalThis.localStorage?.getItem('estaDebug')) return;
  console.debug('[Esta Extension]', message, data);
}
