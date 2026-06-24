import type { HeartbeatPayload } from '../api/heartbeat.service';
import type { DeviceState } from '../api/device.service';
import type { OfflineQueue } from '../offline/offline-queue.service';
import type { SyncManager } from '../offline/sync-manager';
import type { MonitoringService } from './contracts';

export class HeartbeatService implements MonitoringService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue: OfflineQueue,
    private readonly syncManager: SyncManager,
    private readonly device: DeviceState,
    private readonly intervalMs: number,
  ) {}

  async start(): Promise<void> {
    if (this.timer) return;
    await this.queueHeartbeat();
    this.timer = setInterval(() => void this.queueHeartbeat(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async queueHeartbeat(): Promise<void> {
    const payload: HeartbeatPayload = {
      deviceId: this.device.registration.id,
      recordedAt: new Date().toISOString(),
      idleSeconds: 0,
      isOnline: navigator.onLine,
      metadata: {
        source: 'desktop-agent',
      },
    };
    await this.queue.enqueue('heartbeat', payload);
    await this.retry();
  }

  retry(): Promise<void> {
    return this.syncManager.sync();
  }
}