import type { DeviceState } from '../api/device.service';
import type { MonitoringService } from './contracts';
import { ForegroundWindowWatcher } from './foreground-window-watcher';
import { IdleWatcher } from './idle-watcher';
import { MonitoringUploader } from './monitoring-uploader';
import { SessionManager } from './session-manager';
import { UploadQueue } from './upload-queue';

const watchIntervalMs = 2000;
const uploadIntervalMs = 30000;
const idleSessionThresholdSeconds = 60;

export class ActivityCollector implements MonitoringService {
  private watchTimer: number | null = null;
  private uploadTimer: number | null = null;
  private running = false;
  private readonly foregroundWatcher = new ForegroundWindowWatcher();
  private readonly idleWatcher = new IdleWatcher(idleSessionThresholdSeconds);
  private readonly uploader = new MonitoringUploader(new UploadQueue());
  private readonly sessionManager: SessionManager;

  constructor(private readonly device: DeviceState) {
    this.sessionManager = new SessionManager(device.registration.id);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.sample();
    this.watchTimer = window.setInterval(() => void this.sample(), watchIntervalMs);
    this.uploadTimer = window.setInterval(() => void this.flushOpenSession(), uploadIntervalMs);
    await this.uploader.flush();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.watchTimer !== null) window.clearInterval(this.watchTimer);
    if (this.uploadTimer !== null) window.clearInterval(this.uploadTimer);
    this.watchTimer = null;
    this.uploadTimer = null;
    this.uploader.enqueue(this.sessionManager.flush());
    await this.uploader.flush();
  }

  private async sample(): Promise<void> {
    if (!this.running) return;
    try {
      const [foreground, idle] = await Promise.all([
        this.foregroundWatcher.snapshot(),
        this.idleWatcher.snapshot(),
      ]);
      const closedSessions = this.sessionManager.update({
        foreground,
        idleState: idle.state,
        systemIdleSeconds: idle.idleSeconds,
      });
      if (closedSessions.length) {
        this.uploader.enqueue(closedSessions);
        await this.uploader.flush();
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Activity collection sample failed', error);
      }
    }
  }

  private async flushOpenSession(): Promise<void> {
    if (!this.running) return;
    this.uploader.enqueue(this.sessionManager.roll());
    await this.uploader.flush();
  }
}
