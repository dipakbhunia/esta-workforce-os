import type { ForegroundWindowMetadata } from '@shared/contracts';
import { BrowserWatcher, type BrowserMetadata } from './browser-watcher';

export interface ForegroundActivitySnapshot {
  capturedAt: string;
  platform: string;
  processId: number | null;
  processName: string | null;
  executableName: string | null;
  applicationName: string;
  windowTitle: string;
  browser: BrowserMetadata;
}

export class ForegroundWindowWatcher {
  private readonly browserWatcher = new BrowserWatcher();

  async snapshot(): Promise<ForegroundActivitySnapshot> {
    const value = await window.esta.system.getForegroundWindow();
    return this.normalize(value);
  }

  private normalize(value: ForegroundWindowMetadata): ForegroundActivitySnapshot {
    const applicationName =
      value.applicationName ??
      value.processName ??
      value.executableName ??
      'Unknown Application';
    const windowTitle = value.windowTitle ?? 'Untitled window';
    return {
      capturedAt: value.capturedAt,
      platform: value.platform,
      processId: value.processId,
      processName: value.processName,
      executableName: value.executableName,
      applicationName,
      windowTitle,
      browser: this.browserWatcher.detect(value),
    };
  }
}
