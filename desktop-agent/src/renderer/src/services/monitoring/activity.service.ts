import type { DeviceState } from '../api/device.service';
import type { MonitoringService } from './contracts';
import { ForegroundWindowWatcher } from './foreground-window-watcher';
import { IdleWatcher } from './idle-watcher';
import { InputActivityService, zeroInputActivitySnapshot } from './input-activity.service';
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
  private readonly inputActivity = new InputActivityService();
  private readonly uploader = new MonitoringUploader(new UploadQueue());
  private readonly sessionManager: SessionManager;
  private inputEnabled: boolean;
  private removeScreenLockListener: (() => void) | null = null;
  private operationChain: Promise<void> = Promise.resolve();
  private inputPausedByScreenLock = false;

  constructor(private readonly device: DeviceState, options?: { inputEnabled?: boolean }) {
    this.sessionManager = new SessionManager(device.registration.id);
    this.inputEnabled = options?.inputEnabled ?? true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (import.meta.env.DEV) {
      console.debug('[Esta Desktop] Activity collector started', {
        deviceId: this.device.registration.id,
        inputEnabled: this.inputEnabled,
      });
    }
    if (this.inputEnabled) await this.inputActivity.start();
    this.removeScreenLockListener = window.esta.system.onScreenLockChanged((locked) => {
      void this.handleScreenLockChange(locked);
    });
    await this.runSessionOperation(() => this.sampleLocked());
    this.watchTimer = window.setInterval(
      () => void this.runSessionOperation(() => this.sampleLocked()),
      watchIntervalMs,
    );
    this.uploadTimer = window.setInterval(
      () => void this.runSessionOperation(() => this.rollOpenSession()),
      uploadIntervalMs,
    );
    await this.uploader.flush();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.watchTimer !== null) window.clearInterval(this.watchTimer);
    if (this.uploadTimer !== null) window.clearInterval(this.uploadTimer);
    this.watchTimer = null;
    this.uploadTimer = null;
    this.removeScreenLockListener?.();
    this.removeScreenLockListener = null;
    await this.runSessionOperation(async () => {
      await this.closeOpenSession('flush');
      await this.inputActivity.stop();
    });
  }

  async setInputEnabled(enabled: boolean): Promise<void> {
    await this.runSessionOperation(async () => {
      if (this.inputEnabled === enabled) return;
      if (!this.running) {
        this.inputEnabled = enabled;
        return;
      }
      if (enabled) {
        this.inputEnabled = true;
        this.inputPausedByScreenLock = false;
        await this.inputActivity.start();
        return;
      }
      await this.closeOpenSession('roll');
      this.inputEnabled = false;
      await this.inputActivity.stop();
    });
  }

  private async sampleLocked(): Promise<void> {
    if (!this.running) return;
    try {
      const [foreground, idle] = await Promise.all([
        this.foregroundWatcher.snapshot(),
        this.idleWatcher.snapshot(),
      ]);
      const sample = {
        foreground,
        idleState: idle.state,
        systemIdleSeconds: idle.idleSeconds,
      };
      const inputCounts = this.sessionManager.wouldClose(sample)
        ? await this.snapshotAndResetInputCounts()
        : zeroInputActivitySnapshot();
      const closedSessions = this.sessionManager.update(sample, inputCounts);
      if (closedSessions.length) {
        if (import.meta.env.DEV) {
          console.debug('[Esta Desktop] Activity session flushed after context change', {
            count: closedSessions.length,
            firstStartedAt: closedSessions[0]?.startedAt,
            firstEndedAt: closedSessions[0]?.endedAt,
          });
        }
        this.uploader.enqueue(closedSessions);
        await this.uploader.flush();
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Activity collection sample failed', error);
      }
    }
  }

  private async rollOpenSession(): Promise<void> {
    if (!this.running) return;
    await this.closeOpenSession('roll');
  }

  private async snapshotAndResetInputCounts() {
    if (!this.inputEnabled) return zeroInputActivitySnapshot();
    const snapshot = await this.inputActivity.snapshotAndReset();
    if (import.meta.env.DEV) {
      console.debug('[Esta Desktop] Activity collector input snapshot before flush', snapshot);
    }
    return snapshot;
  }

  private async handleScreenLockChange(locked: boolean): Promise<void> {
    await this.runSessionOperation(async () => {
      if (!this.running || !this.inputEnabled) return;
      if (locked) {
        if (this.inputPausedByScreenLock) return;
        await this.closeOpenSession('roll');
        this.inputPausedByScreenLock = true;
        await this.inputActivity.stop();
        return;
      }
      if (!this.inputPausedByScreenLock) return;
      this.inputPausedByScreenLock = false;
      await this.inputActivity.start();
    });
  }

  private async closeOpenSession(mode: 'flush' | 'roll'): Promise<void> {
    const inputCounts = await this.snapshotAndResetInputCounts();
    const closedSessions = mode === 'flush'
      ? this.sessionManager.flush(inputCounts)
      : this.sessionManager.roll(inputCounts);
    if (closedSessions.length && import.meta.env.DEV) {
      console.debug('[Esta Desktop] Activity session flushed', {
        mode,
        count: closedSessions.length,
        firstStartedAt: closedSessions[0]?.startedAt,
        firstEndedAt: closedSessions[0]?.endedAt,
      });
    }
    this.uploader.enqueue(closedSessions);
    await this.uploader.flush();
  }

  private runSessionOperation(operation: () => Promise<void>): Promise<void> {
    const next = this.operationChain.then(operation, operation);
    this.operationChain = next.catch(() => undefined);
    return next;
  }
}
