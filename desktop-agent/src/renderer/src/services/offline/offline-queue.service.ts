export interface OfflineQueueItem<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
  createdAt: string;
}

export interface OfflineQueue {
  enqueue<T>(type: string, payload: T): Promise<OfflineQueueItem<T>>;
  list(): Promise<OfflineQueueItem[]>;
  remove(id: string): Promise<void>;
}

export class OfflineQueueService implements OfflineQueue {
  private readonly items: OfflineQueueItem[] = [];

  async enqueue<T>(type: string, payload: T): Promise<OfflineQueueItem<T>> {
    const item: OfflineQueueItem<T> = {
      id: crypto.randomUUID(),
      type,
      payload,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.items.push(item);
    // TODO: Replace the in-memory queue with a durable local database.
    return item;
  }

  async list(): Promise<OfflineQueueItem[]> {
    return [...this.items];
  }

  async remove(id: string): Promise<void> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) this.items.splice(index, 1);
  }
}
