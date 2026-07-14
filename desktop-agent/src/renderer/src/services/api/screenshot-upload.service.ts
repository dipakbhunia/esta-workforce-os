import type { ScreenshotFilePayload } from '@shared/contracts';
import { apiClient } from './api-client';

interface ScreenshotUploadMetadata {
  attendanceId?: string | null;
  foreground?: {
    applicationName?: string | null;
    windowTitle?: string | null;
  } | null;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export const screenshotUploadService = {
  async upload(payload: ScreenshotFilePayload): Promise<void> {
    const { item, base64 } = payload;
    const metadata = item.metadata as ScreenshotUploadMetadata;
    const form = new FormData();
    form.append('file', base64ToBlob(base64, item.mimeType), `${item.clientCaptureId}.jpg`);
    form.append('deviceId', item.deviceId);
    form.append('clientCaptureId', item.clientCaptureId);
    form.append('capturedAt', item.capturedAt);
    form.append('mimeType', item.mimeType);
    form.append('width', String(item.width));
    form.append('height', String(item.height));
    form.append('sizeBytes', String(item.sizeBytes));
    form.append('checksum', item.checksum);
    if (metadata.attendanceId) form.append('attendanceId', metadata.attendanceId);
    if (metadata.foreground?.applicationName) {
      form.append('applicationName', metadata.foreground.applicationName);
    }
    if (metadata.foreground?.windowTitle) {
      form.append('windowTitle', metadata.foreground.windowTitle);
    }
    form.append('metadata', JSON.stringify(item.metadata));
    await apiClient.request('/monitoring/screenshots', {
      method: 'POST',
      body: form,
    });
  },
};
