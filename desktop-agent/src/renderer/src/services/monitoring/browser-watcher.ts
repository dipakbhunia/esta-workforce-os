import type { ForegroundWindowMetadata } from '@shared/contracts';

const browserProcessNames: Record<string, string> = {
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  brave: 'Brave',
  opera: 'Opera',
  electron: 'Electron',
};

export interface BrowserMetadata {
  isBrowser: boolean;
  browserName?: string;
  url?: string;
  domain?: string;
  title?: string;
}

export class BrowserWatcher {
  detect(snapshot: ForegroundWindowMetadata): BrowserMetadata {
    const processName = snapshot.processName?.toLowerCase() ?? '';
    const executableName = snapshot.executableName?.toLowerCase().replace(/\.exe$/, '') ?? '';
    const browserName = browserProcessNames[processName] ?? browserProcessNames[executableName];

    if (!browserName) {
      return { isBrowser: false };
    }

    // Browser URL reading requires browser-specific extensions, accessibility permissions,
    // or native automation that is not approved in this phase. We upload safe metadata only.
    return {
      isBrowser: true,
      browserName,
      domain: 'unknown',
      title: snapshot.windowTitle ?? undefined,
    };
  }
}
