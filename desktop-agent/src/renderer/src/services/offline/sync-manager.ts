import type {
  OfflineQueue,
  OfflineQueueItem,
} from './offline-queue.service';

export type SyncHandler = (item: OfflineQueueItem) => Promise<void>;

export class SyncManager {
  private running = false;

  constructor(
    private readonly queue: OfflineQueue,
    private readonly handlers: Record<string, SyncHandler>,
  ) {}

  async sync(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const item of await this.queue.list()) {
        const handler = this.handlers[item.type];
        if (!handler) continue;
        try {
          await handler(item);
          await this.queue.remove(item.id);
        } catch {
          // TODO: Persist attempt counts and apply exponential backoff.
        }
      }
    } finally {
      this.running = false;
    }
  }
}
