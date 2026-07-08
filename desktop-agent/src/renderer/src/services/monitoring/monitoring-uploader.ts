import {
  activityUploadService,
  type ActivityUploadPayload,
} from '../api/activity-upload.service';
import { UploadQueue } from './upload-queue';

export class MonitoringUploader {
  private flushing = false;

  constructor(private readonly queue: UploadQueue) {}

  enqueue(payloads: ActivityUploadPayload[]): void {
    payloads.forEach((payload) => this.queue.enqueue(payload));
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const item of this.queue.list()) {
        try {
          this.queue.markAttempt(item.id);
          await activityUploadService.upload(item.payload);
          this.queue.remove(item.id);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.debug('[Esta Desktop] Activity upload queued for retry', error);
          }
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}
