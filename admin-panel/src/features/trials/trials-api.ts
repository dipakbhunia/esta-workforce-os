import { http } from '@/services/http';
import type { ConvertTrialPayload, PaginatedTrials, StartTrialPayload, Trial, TrialListParams } from './trial.types';

export const getTrials = (params: TrialListParams) => http.get<PaginatedTrials>('/trials', { params });
export const getTrial = (id: string) => http.get<Trial>(`/trials/${id}`);
export const startTrial = (payload: StartTrialPayload) => http.post<Trial>('/trials', payload);
export const extendTrial = (id: string, payload: { durationHours: number; reason: string }) => http.post<Trial>(`/trials/${id}/extend`, payload);
export const cancelTrial = (id: string, payload: { reason: string }) => http.post<Trial>(`/trials/${id}/cancel`, payload);
export const convertTrial = (id: string, payload: ConvertTrialPayload) => http.post<Trial>(`/trials/${id}/convert`, payload);
