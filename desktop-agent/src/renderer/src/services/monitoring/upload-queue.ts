import type { ActivityUploadPayload } from '../api/activity-upload.service';

const storageKey = 'esta.monitoring.activityUploadQueue.v1';

export interface QueuedActivityUpload {
  id: string;
  payload: ActivityUploadPayload;
  attempts: number;
  createdAt: string;
}

export class UploadQueue {
  enqueue(payload: ActivityUploadPayload): QueuedActivityUpload {
    const item: QueuedActivityUpload = {
      id: crypto.randomUUID(),
      payload,
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.write([...this.list(), item]);
    return item;
  }

  list(): QueuedActivityUpload[] {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as QueuedActivityUpload[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  markAttempt(id: string): void {
    this.write(
      this.list().map((item) =>
        item.id === id ? { ...item, attempts: item.attempts + 1 } : item,
      ),
    );
  }

  remove(id: string): void {
    this.write(this.list().filter((item) => item.id !== id));
  }

  private write(items: QueuedActivityUpload[]): void {
    window.localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 1000)));
  }
}
