import type { ActivityUploadPayload } from '../api/activity-upload.service';
import type { InputActivitySnapshot } from '@shared/contracts';
import type { ActivityIdleState } from './idle-watcher';
import type { ForegroundActivitySnapshot } from './foreground-window-watcher';
import { zeroInputActivitySnapshot } from './input-activity.service';

const minimumSessionSeconds = 1;
const maxInputCount = 1000000;

export interface ActivitySessionSample {
  foreground: ForegroundActivitySnapshot;
  idleState: ActivityIdleState;
  systemIdleSeconds: number;
}

interface ActiveActivitySession extends ActivitySessionSample {
  id: string;
  startedAt: string;
}

export class SessionManager {
  private current: ActiveActivitySession | null = null;
  private lastOpenedWebsiteKey = '';

  constructor(private readonly deviceId: string) {}

  update(
    sample: ActivitySessionSample,
    inputCounts: InputActivitySnapshot = zeroInputActivitySnapshot(),
    now = new Date(),
  ): ActivityUploadPayload[] {
    if (!this.current) {
      this.current = this.open(sample, now);
      return [];
    }

    if (!this.hasChanged(this.current, sample)) return [];

    const closed = this.close(now, inputCounts);
    this.current = this.open(sample, now);
    return closed ? [closed] : [];
  }

  wouldClose(sample: ActivitySessionSample): boolean {
    return Boolean(this.current && this.hasChanged(this.current, sample));
  }

  flush(
    inputCounts: InputActivitySnapshot = zeroInputActivitySnapshot(),
    now = new Date(),
  ): ActivityUploadPayload[] {
    const closed = this.close(now, inputCounts);
    this.current = null;
    return closed ? [closed] : [];
  }

  roll(
    inputCounts: InputActivitySnapshot = zeroInputActivitySnapshot(),
    now = new Date(),
  ): ActivityUploadPayload[] {
    if (!this.current) return [];
    const sample: ActivitySessionSample = {
      foreground: this.current.foreground,
      idleState: this.current.idleState,
      systemIdleSeconds: this.current.systemIdleSeconds,
    };
    const closed = this.close(now, inputCounts);
    this.current = this.open(sample, now);
    return closed ? [closed] : [];
  }

  private open(sample: ActivitySessionSample, now: Date): ActiveActivitySession {
    const websiteKey = websiteDiagnosticKey(sample);
    if (websiteKey && websiteKey !== this.lastOpenedWebsiteKey && import.meta.env.DEV) {
      this.lastOpenedWebsiteKey = websiteKey;
      console.debug('[Esta Desktop] Website interval opened', {
        browserName: sample.foreground.browser.browserName,
        hostname: sample.foreground.browser.domain,
        startedAt: now.toISOString(),
      });
    }
    return {
      ...sample,
      id: crypto.randomUUID(),
      startedAt: now.toISOString(),
    };
  }

  private close(now: Date, inputCounts: InputActivitySnapshot): ActivityUploadPayload | null {
    if (!this.current) return null;
    const safeInputCounts = sanitizeInputCounts(inputCounts);
    const endedAt = now.toISOString();
    const durationSeconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(this.current.startedAt).getTime()) / 1000),
    );
    if (durationSeconds < minimumSessionSeconds) return null;

    const activeSeconds = this.current.idleState === 'ACTIVE' ? durationSeconds : 0;
    const idleSeconds = this.current.idleState === 'IDLE' ? durationSeconds : 0;
    const applicationName = this.current.foreground.applicationName;
    const windowTitle = this.current.foreground.windowTitle;
    const browser = this.current.foreground.browser;
    const hasWebsiteUrl = browser.isBrowser && browser.urlAvailable && Boolean(browser.domain);
    if (import.meta.env.DEV) {
      console.debug('[Esta Desktop] Activity session closed', {
        clientSessionId: this.current.id,
        startedAt: this.current.startedAt,
        endedAt,
        durationSeconds,
        browserName: browser.browserName,
        hostname: hasWebsiteUrl ? browser.domain : undefined,
        lookupStatus: browser.lookupStatus,
        websiteRecordCount: hasWebsiteUrl ? 1 : 0,
        inputCounts: safeInputCounts,
      });
    }

    return {
      deviceId: this.deviceId,
      clientSessionId: this.current.id,
      startedAt: this.current.startedAt,
      endedAt,
      activeSeconds,
      idleSeconds,
      keystrokeCount: safeInputCounts.keyboardCount,
      keyboardCount: safeInputCounts.keyboardCount,
      mouseClickCount: safeInputCounts.mouseClickCount,
      mouseMoveCount: safeInputCounts.mouseMoveCount,
      scrollCount: safeInputCounts.scrollCount,
      metadata: {
        platform: this.current.foreground.platform,
        processId: this.current.foreground.processId,
        processName: this.current.foreground.processName,
        executableName: this.current.foreground.executableName,
        executable: this.current.foreground.executableName,
        windowTitle,
        idleState: this.current.idleState,
        systemIdleSeconds: this.current.systemIdleSeconds,
        browserDetected: browser.isBrowser,
        browserName: browser.browserName,
        browserWindowTitle: browser.title ?? (browser.isBrowser ? windowTitle : undefined),
        browserProviderAvailable: browser.providerAvailable,
        browserDomain: hasWebsiteUrl ? browser.domain : undefined,
        browserHostnameSource: hasWebsiteUrl ? browser.source : undefined,
        urlAvailable: hasWebsiteUrl,
        inputCountSource: 'numeric_global_event_counts',
        privacy: 'metadata_only_no_keylogging_no_clipboard_no_page_content',
      },
      applications: [
        {
          applicationName,
          windowTitle,
          startedAt: this.current.startedAt,
          endedAt,
          durationSeconds,
        },
      ],
      websites: hasWebsiteUrl
        ? [
            {
              browserName: browser.browserName,
              domain: browser.domain as string,
              pageTitle: browser.title ?? windowTitle,
              startedAt: this.current.startedAt,
              endedAt,
              durationSeconds,
            },
          ]
        : undefined,
    };
  }

  private hasChanged(current: ActiveActivitySession, next: ActivitySessionSample): boolean {
    return (
      current.idleState !== next.idleState ||
      current.foreground.applicationName !== next.foreground.applicationName ||
      current.foreground.windowTitle !== next.foreground.windowTitle ||
      current.foreground.browser.browserName !== next.foreground.browser.browserName ||
      current.foreground.browser.domain !== next.foreground.browser.domain ||
      current.foreground.browser.url !== next.foreground.browser.url
    );
  }
}

function websiteDiagnosticKey(sample: ActivitySessionSample): string {
  const browser = sample.foreground.browser;
  return browser.isBrowser && browser.urlAvailable && browser.domain
    ? `${browser.browserName ?? 'browser'}|${browser.domain}`
    : '';
}

function sanitizeInputCounts(value: InputActivitySnapshot): InputActivitySnapshot {
  return {
    keyboardCount: sanitizeCount(value.keyboardCount),
    mouseClickCount: sanitizeCount(value.mouseClickCount),
    mouseMoveCount: sanitizeCount(value.mouseMoveCount),
    scrollCount: sanitizeCount(value.scrollCount),
  };
}

function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maxInputCount, Math.max(0, Math.floor(value)))
    : 0;
}
