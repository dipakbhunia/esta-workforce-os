import type { ActivityUploadPayload } from '../api/activity-upload.service';
import type { ActivityIdleState } from './idle-watcher';
import type { ForegroundActivitySnapshot } from './foreground-window-watcher';

const minimumSessionSeconds = 1;

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

  constructor(private readonly deviceId: string) {}

  update(sample: ActivitySessionSample, now = new Date()): ActivityUploadPayload[] {
    if (!this.current) {
      this.current = this.open(sample, now);
      return [];
    }

    if (!this.hasChanged(this.current, sample)) return [];

    const closed = this.close(now);
    this.current = this.open(sample, now);
    return closed ? [closed] : [];
  }

  flush(now = new Date()): ActivityUploadPayload[] {
    const closed = this.close(now);
    this.current = null;
    return closed ? [closed] : [];
  }

  roll(now = new Date()): ActivityUploadPayload[] {
    if (!this.current) return [];
    const sample: ActivitySessionSample = {
      foreground: this.current.foreground,
      idleState: this.current.idleState,
      systemIdleSeconds: this.current.systemIdleSeconds,
    };
    const closed = this.close(now);
    this.current = this.open(sample, now);
    return closed ? [closed] : [];
  }

  private open(sample: ActivitySessionSample, now: Date): ActiveActivitySession {
    return {
      ...sample,
      id: crypto.randomUUID(),
      startedAt: now.toISOString(),
    };
  }

  private close(now: Date): ActivityUploadPayload | null {
    if (!this.current) return null;
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

    return {
      deviceId: this.deviceId,
      clientSessionId: this.current.id,
      startedAt: this.current.startedAt,
      endedAt,
      activeSeconds,
      idleSeconds,
      keystrokeCount: 0,
      mouseClickCount: 0,
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
        urlAvailable: hasWebsiteUrl,
        inputCountSource: 'not_collected_in_phase_6_4a',
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
              url: browser.url,
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
