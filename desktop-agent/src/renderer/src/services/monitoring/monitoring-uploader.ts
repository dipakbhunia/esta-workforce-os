import {
  activityUploadService,
  type ActivityUploadPayload,
} from '../api/activity-upload.service';
import { ApiError } from '../api/api-client';
import { UploadQueue } from './upload-queue';

export class MonitoringUploader {
  private flushing = false;

  constructor(private readonly queue: UploadQueue) {}

  enqueue(payloads: ActivityUploadPayload[]): void {
    payloads.forEach((payload) => {
      const item = this.queue.enqueue(payload);
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Activity session queued', {
          queueId: item.id,
          clientSessionId: payload.clientSessionId,
          startedAt: payload.startedAt,
          endedAt: payload.endedAt,
        });
      }
    });
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const item of this.queue.list()) {
        try {
          this.queue.markAttempt(item.id);
          if (import.meta.env.DEV) {
            console.debug('[Esta Desktop] Activity upload requested', {
              queueId: item.id,
              clientSessionId: item.payload.clientSessionId,
              attempt: item.attempts + 1,
              startedAt: item.payload.startedAt,
              endedAt: item.payload.endedAt,
              websiteRecordCount: item.payload.websites?.length ?? 0,
              websiteDomains: item.payload.websites?.map((website) => website.domain) ?? [],
              inputCounts: {
                keyboardCount: item.payload.keyboardCount ?? 0,
                mouseClickCount: item.payload.mouseClickCount ?? 0,
                mouseMoveCount: item.payload.mouseMoveCount ?? 0,
                scrollCount: item.payload.scrollCount ?? 0,
              },
            });
          }
          await activityUploadService.upload(item.payload);
          this.queue.remove(item.id);
          if (import.meta.env.DEV) {
            console.debug('[Esta Desktop] Activity upload succeeded', {
              queueId: item.id,
              clientSessionId: item.payload.clientSessionId,
              websiteRecordCount: item.payload.websites?.length ?? 0,
              inputCounts: {
                keyboardCount: item.payload.keyboardCount ?? 0,
                mouseClickCount: item.payload.mouseClickCount ?? 0,
                mouseMoveCount: item.payload.mouseMoveCount ?? 0,
                scrollCount: item.payload.scrollCount ?? 0,
              },
            });
          }
        } catch (error) {
          if (isDuplicateUpload(error)) {
            this.queue.remove(item.id);
            if (import.meta.env.DEV) {
              console.debug('[Esta Desktop] Activity duplicate upload skipped', {
                queueId: item.id,
                clientSessionId: item.payload.clientSessionId,
              });
            }
            continue;
          }
          if (import.meta.env.DEV) {
            console.debug('[Esta Desktop] Activity upload failed; queued for retry', {
              queueId: item.id,
              clientSessionId: item.payload.clientSessionId,
              status: error instanceof ApiError ? error.status : undefined,
              message: error instanceof Error ? error.message : String(error),
              websiteRecordCount: item.payload.websites?.length ?? 0,
              inputCounts: {
                keyboardCount: item.payload.keyboardCount ?? 0,
                mouseClickCount: item.payload.mouseClickCount ?? 0,
                mouseMoveCount: item.payload.mouseMoveCount ?? 0,
                scrollCount: item.payload.scrollCount ?? 0,
              },
            });
          }
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

function isDuplicateUpload(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 409) return false;
  return String(error.message).toLowerCase().includes('already uploaded');
}
