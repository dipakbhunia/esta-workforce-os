import type { HeartbeatResponse } from '../../types/api';
import { apiClient } from './api-client';

export interface HeartbeatPayload {
  deviceId: string;
  recordedAt: string;
  idleSeconds: number;
  isOnline: boolean;
  metadata?: Record<string, unknown>;
}

export const heartbeatApiService = {
  send(payload: HeartbeatPayload): Promise<HeartbeatResponse> {
    return apiClient.request<HeartbeatResponse>('/monitoring/heartbeats', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};