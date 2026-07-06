import { http } from '@/services/http';
import type {
  LiveStatusParams,
  LiveStatusRecord,
  MonitoringActivity,
  MonitoringApplicationUsage,
  MonitoringDevice,
  MonitoringListParams,
  MonitoringScreenshot,
  MonitoringWebsiteUsage,
  PaginatedMonitoringResponse,
} from '../types/monitoring.types';

export function getLiveStatuses(params: LiveStatusParams) {
  return http.get<PaginatedMonitoringResponse<LiveStatusRecord>>('/monitoring/live-status', { params });
}

export function getLiveStatus(employeeId: string) {
  return http.get<LiveStatusRecord>(`/monitoring/live-status/${employeeId}`);
}

export function getMonitoringActivity(params: MonitoringListParams) {
  return http.get<PaginatedMonitoringResponse<MonitoringActivity>>('/monitoring/activity', { params });
}

export function getEmployeeMonitoringActivity(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringActivity>>(`/monitoring/activity/${employeeId}`, { params });
}

export function getMonitoringScreenshots(params: MonitoringListParams) {
  return http.get<PaginatedMonitoringResponse<MonitoringScreenshot>>('/monitoring/screenshots', { params });
}

export function getEmployeeMonitoringScreenshots(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringScreenshot>>(`/monitoring/screenshots/${employeeId}`, { params });
}

export function getMonitoringApplications(params: MonitoringListParams) {
  return http.get<PaginatedMonitoringResponse<MonitoringApplicationUsage>>('/monitoring/apps', { params });
}

export function getEmployeeMonitoringApplications(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringApplicationUsage>>(`/monitoring/apps/${employeeId}`, { params });
}

export function getMonitoringWebsites(params: MonitoringListParams) {
  return http.get<PaginatedMonitoringResponse<MonitoringWebsiteUsage>>('/monitoring/websites', { params });
}

export function getEmployeeMonitoringWebsites(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringWebsiteUsage>>(`/monitoring/websites/${employeeId}`, { params });
}

export function getMonitoringDevices(params: MonitoringListParams) {
  return http.get<PaginatedMonitoringResponse<MonitoringDevice>>('/monitoring/devices', { params });
}

export function getEmployeeMonitoringDevices(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringDevice>>(`/monitoring/devices/${employeeId}`, { params });
}
