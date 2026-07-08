import { apiClient } from './api-client';

export interface ActivityUploadApplication {
  applicationName: string;
  windowTitle?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface ActivityUploadWebsite {
  browserName?: string;
  domain: string;
  url?: string;
  pageTitle?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface ActivityUploadPayload {
  deviceId: string;
  clientSessionId: string;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  idleSeconds?: number;
  keystrokeCount?: number;
  mouseClickCount?: number;
  metadata?: Record<string, unknown>;
  applications?: ActivityUploadApplication[];
  websites?: ActivityUploadWebsite[];
}

export const activityUploadService = {
  upload(payload: ActivityUploadPayload): Promise<unknown> {
    return apiClient.request<unknown>('/monitoring/activity', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
