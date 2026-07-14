import type { DeviceState } from '../api/device.service';
import { screenshotUploadService } from '../api/screenshot-upload.service';
import { environment } from '../../config/environment';
import type { MonitoringService } from './contracts';

const defaultRetryAfterMs = 5 * 60 * 1000;

export class ScreenshotService implements MonitoringService {
  private running = false;
  private captureTimer: number | null = null;
  private flushing = false;
  private capturing = false;
  private screenLocked = false;
  private removeScreenLockListener: (() => void) | null = null;

  constructor(
    private readonly device: DeviceState,
    private readonly attendanceId: string | null,
    private readonly intervalMs = environment.screenshotIntervalMs,
    private readonly jitterMs = environment.screenshotJitterMs,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.screenLocked = await window.esta.system.isScreenLocked();
    this.removeScreenLockListener = window.esta.system.onScreenLockChanged((locked) => {
      this.screenLocked = locked;
      if (locked) {
        this.clearTimer();
        return;
      }
      this.scheduleNextCapture();
    });
    await this.flushQueue();
    this.scheduleNextCapture();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.clearTimer();
    this.removeScreenLockListener?.();
    this.removeScreenLockListener = null;
    await this.flushQueue();
  }

  private scheduleNextCapture(delayMs = this.nextDelayMs()): void {
    if (!this.running || this.screenLocked) return;
    this.clearTimer();
    this.captureTimer = window.setTimeout(() => {
      void this.captureAndUpload();
    }, delayMs);
  }

  private async captureAndUpload(): Promise<void> {
    if (!this.running || this.screenLocked || this.capturing) return;
    this.capturing = true;
    try {
      const foreground = await window.esta.system.getForegroundWindow();
      await window.esta.screenshots.capture({
        deviceId: this.device.registration.id,
        attendanceId: this.attendanceId,
        foreground,
      });
      await this.flushQueue();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Screenshot capture skipped', error);
      }
    } finally {
      this.capturing = false;
      this.scheduleNextCapture();
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const queue = await window.esta.screenshots.listQueue();
      for (const item of queue) {
        try {
          const payload = await window.esta.screenshots.readFile(item.id);
          await screenshotUploadService.upload(payload);
          await window.esta.screenshots.markUploaded(item.id);
        } catch (error) {
          if (this.isInvalidLocalQueueFile(error)) {
            if (import.meta.env.DEV) {
              console.debug('[Esta Desktop] Skipped invalid local screenshot queue item', error);
            }
            continue;
          }
          await window.esta.screenshots.markFailed(item.id, this.retryAfterMs(item.attempts));
          if (import.meta.env.DEV) {
            console.debug('[Esta Desktop] Screenshot upload queued for retry', error);
          }
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private nextDelayMs(): number {
    if (this.jitterMs <= 0) return this.intervalMs;
    return this.intervalMs + Math.floor(Math.random() * this.jitterMs);
  }

  private retryAfterMs(attempts: number): number {
    return Math.min(defaultRetryAfterMs * Math.max(1, attempts + 1), 30 * 60 * 1000);
  }

  private isInvalidLocalQueueFile(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('Screenshot queue file');
  }

  private clearTimer(): void {
    if (this.captureTimer !== null) {
      window.clearTimeout(this.captureTimer);
      this.captureTimer = null;
    }
  }
}
