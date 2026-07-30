import { http } from '@/services/http';
import type {
  LiveStatusParams,
  LiveStatusRecord,
  MonitoringActivity,
  MonitoringAlert,
  MonitoringAlertActionPayload,
  MonitoringAlertDetail,
  MonitoringAlertEvaluationResponse,
  MonitoringAlertListResponse,
  MonitoringAlertParams,
  MonitoringAlertPolicy,
  MonitoringAlertPolicyListResponse,
  MonitoringAlertPolicyParams,
  MonitoringAlertPolicyPayload,
  MonitoringApplicationUsage,
  MonitoringDevice,
  DeviceHistoryParams,
  DeviceHistoryResponse,
  MonitoringDeviceActionResponse,
  MonitoringDeviceDetail,
  MonitoringDeviceOverview,
  ApplicationProductivityPayload,
  ApplicationProductivityRule,
  ProductivityRuleParams,
  ProductivityAnalyticsParams,
  ProductivityAnalyticsResponse,
  ProductivityCoverageParams,
  ProductivityCoverageResponse,
  ProductivityEmployeeDetailsParams,
  ProductivityEmployeeDetailsResponse,
  ProductivityTrendsParams,
  ProductivityTrendsResponse,
  WebsiteProductivityPayload,
  WebsiteProductivityRule,
  MonitoringIdleParams,
  MonitoringIdleResponse,
  MonitoringDevicesResponse,
  MonitoringListParams,
  MonitoringScreenshot,
  MonitoringScreenshotPreview,
  MonitoringSummaryParams,
  MonitoringSummaryResponse,
  MonitoringTimelineParams,
  MonitoringTimelineResponse,
  MonitoringWebsiteUsage,
  MonitoringOperationsDashboard,
  MonitoringOperationsParams,
  ReassignMonitoringDevicePayload,
  RenameMonitoringDevicePayload,
  UpdateMonitoringDeviceMonitoringPayload,
  PaginatedMonitoringResponse,
} from '../types/monitoring.types';



export function getMonitoringAlertPolicies(params: MonitoringAlertPolicyParams) {
  return http.get<MonitoringAlertPolicyListResponse>('/monitoring/alert-policies', { params });
}

export function getMonitoringAlertPolicy(id: string) {
  return http.get<MonitoringAlertPolicy>(`/monitoring/alert-policies/${id}`);
}

export function createMonitoringAlertPolicy(payload: MonitoringAlertPolicyPayload) {
  return http.post<MonitoringAlertPolicy>('/monitoring/alert-policies', payload);
}

export function updateMonitoringAlertPolicy(id: string, payload: MonitoringAlertPolicyPayload) {
  return http.patch<MonitoringAlertPolicy>(`/monitoring/alert-policies/${id}`, payload);
}

export function deleteMonitoringAlertPolicy(id: string) {
  return http.delete<MonitoringAlertPolicy>(`/monitoring/alert-policies/${id}`);
}
export function getMonitoringAlerts(params: MonitoringAlertParams) {
  return http.get<MonitoringAlertListResponse>('/monitoring/alerts', { params });
}

export function getMonitoringAlert(alertId: string) {
  return http.get<MonitoringAlertDetail>(`/monitoring/alerts/${alertId}`);
}

export function acknowledgeMonitoringAlert(alertId: string, payload: MonitoringAlertActionPayload = {}) {
  return http.patch<MonitoringAlert>(`/monitoring/alerts/${alertId}/acknowledge`, payload);
}

export function resolveMonitoringAlert(alertId: string, payload: MonitoringAlertActionPayload = {}) {
  return http.patch<MonitoringAlert>(`/monitoring/alerts/${alertId}/resolve`, payload);
}

export function evaluateMonitoringAlerts() {
  return http.post<MonitoringAlertEvaluationResponse>('/monitoring/alerts/evaluate');
}
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

export function getMonitoringScreenshotPreview(id: string) {
  return http.get<MonitoringScreenshotPreview>(`/monitoring/screenshots/${id}/view`);
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
  return http.get<MonitoringDevicesResponse>('/monitoring/devices', { params });
}

export function getMonitoringDevicesOverview() {
  return http.get<MonitoringDeviceOverview>('/monitoring/devices/overview');
}

export function getMonitoringDeviceDetail(deviceId: string) {
  return http.get<MonitoringDeviceDetail>(`/monitoring/devices/${deviceId}/detail`);
}

export function getMonitoringDeviceHistory(deviceId: string, params: DeviceHistoryParams) {
  return http.get<DeviceHistoryResponse>(`/monitoring/devices/${deviceId}/history`, { params });
}
export function renameMonitoringDevice(deviceId: string, payload: RenameMonitoringDevicePayload) {
  return http.patch<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/name`, payload);
}

export function reassignMonitoringDevice(deviceId: string, payload: ReassignMonitoringDevicePayload) {
  return http.patch<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/assignment`, payload);
}

export function updateMonitoringDeviceMonitoring(deviceId: string, payload: UpdateMonitoringDeviceMonitoringPayload) {
  return http.patch<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/monitoring`, payload);
}

export function trustMonitoringDevice(deviceId: string) {
  return http.patch<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/trust`);
}

export function revokeMonitoringDevice(deviceId: string) {
  return http.patch<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/revoke`);
}

export function resetMonitoringDeviceRegistration(deviceId: string) {
  return http.post<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/reset-registration`);
}

export function forceMonitoringDeviceReregistration(deviceId: string) {
  return http.post<MonitoringDeviceActionResponse>(`/monitoring/devices/${deviceId}/force-reregister`);
}

export function getEmployeeMonitoringDevices(employeeId: string, params: Omit<MonitoringListParams, 'employeeId'>) {
  return http.get<PaginatedMonitoringResponse<MonitoringDevice>>(`/monitoring/devices/${employeeId}`, { params });
}

export function getMonitoringSummary(params: MonitoringSummaryParams) {
  return http.get<MonitoringSummaryResponse>('/monitoring/summary', { params });
}



export function getProductivityAnalytics(params: ProductivityAnalyticsParams) {
  return http.get<ProductivityAnalyticsResponse>('/monitoring/productivity/analytics', { params });
}
export function getApplicationProductivityRules(params: ProductivityRuleParams) {
  return http.get<PaginatedMonitoringResponse<ApplicationProductivityRule>>('/monitoring/productivity/applications', { params });
}

export function createApplicationProductivityRule(payload: ApplicationProductivityPayload) {
  return http.post<ApplicationProductivityRule>('/monitoring/productivity/applications', payload);
}

export function updateApplicationProductivityRule(id: string, payload: Partial<ApplicationProductivityPayload>) {
  return http.patch<ApplicationProductivityRule>(`/monitoring/productivity/applications/${id}`, payload);
}

export function deleteApplicationProductivityRule(id: string) {
  return http.delete<ApplicationProductivityRule>(`/monitoring/productivity/applications/${id}`);
}

export function getWebsiteProductivityRules(params: ProductivityRuleParams) {
  return http.get<PaginatedMonitoringResponse<WebsiteProductivityRule>>('/monitoring/productivity/websites', { params });
}

export function createWebsiteProductivityRule(payload: WebsiteProductivityPayload) {
  return http.post<WebsiteProductivityRule>('/monitoring/productivity/websites', payload);
}

export function updateWebsiteProductivityRule(id: string, payload: Partial<WebsiteProductivityPayload>) {
  return http.patch<WebsiteProductivityRule>(`/monitoring/productivity/websites/${id}`, payload);
}

export function deleteWebsiteProductivityRule(id: string) {
  return http.delete<WebsiteProductivityRule>(`/monitoring/productivity/websites/${id}`);
}
export function getMonitoringIdle(params: MonitoringIdleParams) {
  return http.get<MonitoringIdleResponse>('/monitoring/idle', { params });
}

export function getMonitoringTimeline(params: MonitoringTimelineParams) {
  return http.get<MonitoringTimelineResponse>('/monitoring/timeline', { params });
}









export function getProductivityCoverage(params: ProductivityCoverageParams) {
  return http.get<ProductivityCoverageResponse>('/monitoring/productivity/coverage', { params });
}

export function getProductivityEmployeeDetails(employeeId: string, params: ProductivityEmployeeDetailsParams) {
  return http.get<ProductivityEmployeeDetailsResponse>(`/monitoring/productivity/employees/${employeeId}`, { params });
}

export function exportProductivityAnalytics(params: ProductivityAnalyticsParams) {
  return http.get<string>('/monitoring/productivity/analytics/export', { params, responseType: 'text' });
}

export function exportProductivityCoverage(params: ProductivityCoverageParams) {
  return http.get<string>('/monitoring/productivity/coverage/export', { params, responseType: 'text' });
}

export function exportProductivityEmployee(employeeId: string, params: ProductivityEmployeeDetailsParams) {
  return http.get<string>(`/monitoring/productivity/employees/${employeeId}/export`, { params, responseType: 'text' });
}

export function getProductivityTrends(params: ProductivityTrendsParams) {
  return http.get<ProductivityTrendsResponse>('/monitoring/productivity/trends', { params });
}

export function getMonitoringOperationsDashboard(params: MonitoringOperationsParams) {
  return http.get<MonitoringOperationsDashboard>('/monitoring/operations/dashboard', { params });
}

export function exportMonitoringOperationsReport(params: MonitoringOperationsParams & { format: 'CSV' | 'PDF' }) {
  return http.get<Blob>('/monitoring/operations/report', { params, responseType: 'blob' });
}
