import { http } from '@/services/http';
import type { ApplyRotationPatternPayload, ApplyRotationPatternResponse, RotationPattern, RotationPatternListParams, RotationPatternListResponse, RotationPatternPayload, RotationPatternPreviewResponse } from '../types/rotation-pattern.types';

export function getRotationPatterns(params: RotationPatternListParams) { return http.get<RotationPatternListResponse>('/rotation-patterns', { params }); }
export function exportRotationPatterns(params: Omit<RotationPatternListParams, 'page' | 'limit'>) { return http.get<Blob>('/rotation-patterns/export', { params: { ...params, format: 'CSV' }, responseType: 'blob' }); }
export function getRotationPattern(id: string) { return http.get<RotationPattern>(`/rotation-patterns/${id}`); }
export function createRotationPattern(payload: RotationPatternPayload) { return http.post<RotationPattern>('/rotation-patterns', payload); }
export function updateRotationPattern(id: string, payload: Partial<RotationPatternPayload>) { return http.patch<RotationPattern>(`/rotation-patterns/${id}`, payload); }
export function deleteRotationPattern(id: string) { return http.delete<RotationPattern>(`/rotation-patterns/${id}`); }
export function previewRotationPattern(id: string, payload: { dateFrom: string; dateTo?: string; numberOfDays?: number; anchorDate?: string }) { return http.post<RotationPatternPreviewResponse>(`/rotation-patterns/${id}/preview`, payload); }
export function applyRotationPattern(rosterId: string, payload: ApplyRotationPatternPayload) { return http.post<ApplyRotationPatternResponse>(`/shift-rosters/${rosterId}/apply-rotation`, payload); }