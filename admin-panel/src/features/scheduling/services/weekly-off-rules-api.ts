import { http } from '@/services/http';
import type { WeeklyOffRule, WeeklyOffRuleListParams, WeeklyOffRuleListResponse, WeeklyOffRulePayload } from '../types/weekly-off-rule.types';

export function getWeeklyOffRules(params: WeeklyOffRuleListParams) {
  return http.get<WeeklyOffRuleListResponse>('/weekly-off-rules', { params });
}

export function exportWeeklyOffRules(params: Omit<WeeklyOffRuleListParams, 'page' | 'limit'>) {
  return http.get<Blob>('/weekly-off-rules/export', { params: { ...params, format: 'CSV' }, responseType: 'blob' });
}

export function getWeeklyOffRule(id: string) {
  return http.get<WeeklyOffRule>(`/weekly-off-rules/${id}`);
}

export function createWeeklyOffRule(payload: WeeklyOffRulePayload) {
  return http.post<WeeklyOffRule>('/weekly-off-rules', payload);
}

export function updateWeeklyOffRule(id: string, payload: Partial<WeeklyOffRulePayload>) {
  return http.patch<WeeklyOffRule>(`/weekly-off-rules/${id}`, payload);
}

export function deleteWeeklyOffRule(id: string) {
  return http.delete<WeeklyOffRule>(`/weekly-off-rules/${id}`);
}