import { http } from '@/services/http';
import type {
  ApplyRosterTemplatePayload,
  ApplyRosterTemplateResponse,
  RosterPreviewResponse,
  RosterTemplate,
  RosterTemplateListParams,
  RosterTemplateListResponse,
  RosterTemplatePayload,
} from '../types/roster-template.types';

export function getRosterTemplates(params: RosterTemplateListParams) {
  return http.get<RosterTemplateListResponse>('/roster-templates', { params });
}

export function exportRosterTemplates(params: Omit<RosterTemplateListParams, 'page' | 'limit'>) {
  return http.get<Blob>('/roster-templates/export', { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function getRosterTemplate(id: string) {
  return http.get<RosterTemplate>(`/roster-templates/${id}`);
}

export function createRosterTemplate(payload: RosterTemplatePayload) {
  return http.post<RosterTemplate>('/roster-templates', payload);
}

export function updateRosterTemplate(id: string, payload: Partial<RosterTemplatePayload>) {
  return http.patch<RosterTemplate>(`/roster-templates/${id}`, payload);
}

export function deleteRosterTemplate(id: string) {
  return http.delete<RosterTemplate>(`/roster-templates/${id}`);
}

export function previewRosterTemplate(id: string, payload: { dateFrom: string; dateTo: string }) {
  return http.post<RosterPreviewResponse>(`/roster-templates/${id}/preview`, payload);
}

export function applyRosterTemplate(rosterId: string, payload: ApplyRosterTemplatePayload) {
  return http.post<ApplyRosterTemplateResponse>(`/shift-rosters/${rosterId}/apply-template`, payload);
}
