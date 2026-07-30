export interface PaginatedMonitoringResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MonitoringListParams {
  page: number;
  limit: number;
  search?: string;
  employeeId?: string;
  deviceId?: string;
  branchId?: string;
  departmentId?: string;
  status?: string;
  online?: boolean;
  monitoringEnabled?: boolean;
  browserConnected?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export type MonitoringSummaryParams = MonitoringListParams;

export type LiveStatusValue =
  | 'ONLINE'
  | 'WORKING'
  | 'ON_BREAK'
  | 'AWAY'
  | 'OFFLINE'
  | 'PUNCHED_OUT'
  | 'AUTO_PUNCHED_OUT';

export type LiveAttendanceState =
  | 'READY_TO_PUNCH_IN'
  | 'PUNCHED_IN'
  | 'ON_BREAK'
  | 'PUNCHED_OUT'
  | 'AUTO_PUNCHED_OUT';

export type LiveHeartbeatState = 'ONLINE' | 'AWAY' | 'OFFLINE';

export type MonitoringDeviceStatus = 'ACTIVE' | 'INACTIVE' | 'TRUSTED' | 'REVOKED' | 'REREGISTRATION_REQUIRED';

export interface MonitoringEmployee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
}

export interface LiveStatusDevice {
  id: string;
  name: string;
  platform: string;
  status: MonitoringDeviceStatus;
}

export interface LiveStatusRecord {
  employeeId: string;
  employeeCode: string;
  user?: {
    name: string;
    email: string;
  } | null;
  status: LiveStatusValue;
  attendanceState: LiveAttendanceState;
  heartbeatState: LiveHeartbeatState;
  lastHeartbeatAt: string | null;
  isOnBreak: boolean;
  punchedInAt: string | null;
  punchedOutAt: string | null;
  device: LiveStatusDevice | null;
}

export interface LiveStatusParams {
  page: number;
  limit: number;
  search?: string;
  status?: LiveStatusValue;
}

export interface MonitoringDevice {
  id: string;
  employee?: MonitoringEmployee | null;
  deviceIdentifier: string;
  deviceName: string;
  hostname: string;
  platform: string;
  operatingSystem: string;
  osVersion: string | null;
  deviceType: string;
  agentVersion: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  browserExtensionInstalled: boolean | null;
  browserExtensionConnected: boolean | null;
  monitoringEnabled: boolean;
  online: boolean;
  status: MonitoringDeviceStatus;
  securityStatus: MonitoringDeviceStatus;
  trusted: boolean;
  revoked: boolean;
  registrationRequired: boolean;
  lastHeartbeatAt: string | null;
  lastActivityAt: string | null;
  lastScreenshotAt: string | null;
  registeredAt: string;
}

export interface MonitoringDevicesResponse extends PaginatedMonitoringResponse<MonitoringDevice> {
  summary: {
    totalDevices: number;
    online: number;
    offline: number;
    monitoringDisabled: number;
  };
}

export interface MonitoringDeviceOverview {
  totals: {
    devices: number;
    online: number;
    offline: number;
    monitoringDisabled: number;
    unassigned: number;
  };
  operatingSystems: Array<{
    name: string;
    count: number;
  }>;
  agentVersions: Array<{
    name: string;
    count: number;
  }>;
  browserStatus: {
    connected: number;
    unknown: number;
  };
  recentlyRegistered: Array<{
    id: string;
    deviceName: string;
    employee: MonitoringEmployee | null;
    registeredAt: string;
    online: boolean;
    status: MonitoringDeviceStatus;
  }>;
  attention: {
    offlineLongTime: number;
    neverReported: number;
    monitoringDisabled: number;
    noEmployeeAssigned: number;
  };
}

export type MonitoringDeviceBrowserStatus = 'CONNECTED' | 'MISSING' | 'UNKNOWN';
export type MonitoringDeviceRecentActivityType = 'HEARTBEAT' | 'ACTIVITY' | 'SCREENSHOT' | 'APPLICATION' | 'WEBSITE';

export interface MonitoringDeviceActionSummary {
  id: string;
  deviceName: string;
  employee: MonitoringEmployee;
  monitoringEnabled: boolean;
  status: MonitoringDeviceStatus;
  securityStatus: MonitoringDeviceStatus;
  registrationRequired: boolean;
  registrationVersion: number;
  trustedAt: string | null;
  revokedAt: string | null;
  registrationResetAt: string | null;
  reregistrationRequiredAt: string | null;
  updatedAt: string;
}

export interface MonitoringDeviceActionResponse {
  success: boolean;
  device: MonitoringDeviceActionSummary;
}

export interface RenameMonitoringDevicePayload {
  deviceName: string;
}

export interface ReassignMonitoringDevicePayload {
  employeeId: string;
}

export interface UpdateMonitoringDeviceMonitoringPayload {
  enabled: boolean;
}
export interface MonitoringDeviceDetail {
  id: string;
  identity: {
    deviceName: string | null;
    hostname: string | null;
    deviceIdentifier: string | null;
    deviceType: string | null;
    platform: string | null;
    operatingSystem: string | null;
    osVersion: string | null;
    architecture: string | null;
    agentVersion: string | null;
    registeredAt: string;
  };
  assignment: {
    employee: {
      id: string;
      name: string;
      employeeCode: string | null;
      avatarUrl: string | null;
    } | null;
    department: {
      id: string;
      name: string;
      code?: string | null;
    } | null;
    branch: {
      id: string;
      name: string;
      code?: string | null;
    } | null;
    company: {
      id: string;
      name: string;
    } | null;
  };
  monitoring: {
    online: boolean;
    monitoringEnabled: boolean;
    securityStatus: MonitoringDeviceStatus;
    trusted: boolean;
    revoked: boolean;
    registrationRequired: boolean;
    trustedAt: string | null;
    revokedAt: string | null;
    registrationResetAt: string | null;
    reregistrationRequiredAt: string | null;
    registrationVersion: number;
    lastHeartbeatAt: string | null;
    lastActivityAt: string | null;
    lastScreenshotAt: string | null;
    lastSeenAt: string | null;
  };
  browserIntegration: {
    status: MonitoringDeviceBrowserStatus;
    lastConnectedAt: string | null;
  };
  todayActivity: {
    activeSeconds: number;
    idleSeconds: number;
    appsUsed: number;
    websitesUsed: number;
    keyboardCount: number | null;
    mouseClickCount: number | null;
    mouseMoveCount: number | null;
    scrollCount: number | null;
  };
  screenshots: {
    todayCount: number;
    lastScreenshotAt: string | null;
    latestScreenshot: {
      id: string;
      capturedAt: string;
      previewUrl: string | null;
    } | null;
  };
  recentActivity: Array<{
    id: string;
    type: MonitoringDeviceRecentActivityType;
    occurredAt: string;
    title: string;
    description: string | null;
  }>;
}

export interface MonitoringApplicationUsage {
  id: string;
  employee?: MonitoringEmployee | null;
  application: string;
  windowTitle: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface MonitoringWebsiteUsage {
  id: string;
  employee?: MonitoringEmployee | null;
  browserName: string | null;
  domain: string;
  url: string | null;
  pageTitle: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface MonitoringActivity {
  id: string;
  employee?: MonitoringEmployee | null;
  deviceId: string;
  clientSessionId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  keystrokeCount: number | null;
  keyboardCount: number | null;
  mouseClickCount: number | null;
  mouseMoveCount: number | null;
  scrollCount: number | null;
  applications: MonitoringApplicationUsage[];
  websites: MonitoringWebsiteUsage[];
}

export interface MonitoringScreenshot {
  id: string;
  employee?: MonitoringEmployee | null;
  deviceId: string;
  capturedAt: string;
  thumbnailUrl: string | null;
  previewAvailable: boolean;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
  metadata?: Record<string, unknown> | null;
  inputMetrics?: {
    keyboardCount: number;
    mouseClickCount: number;
    mouseMoveCount: number;
    scrollCount: number;
  } | null;
}

export interface MonitoringScreenshotPreview {
  url: string;
  expiresAt: string;
}

export interface MonitoringSummaryEmployeeUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface MonitoringSummaryEmployee {
  id: string;
  employeeCode: string;
  user?: MonitoringSummaryEmployeeUser | null;
}

export type ProductivityCategory = 'PRODUCTIVE' | 'NEUTRAL' | 'UNPRODUCTIVE' | 'UNCLASSIFIED';
export type ProductivityScopeType = 'GLOBAL' | 'COMPANY';

export interface ProductivityRuleParams {
  page: number;
  limit: number;
  search?: string;
  category?: ProductivityCategory | '';
  enabled?: boolean | '';
  scope?: ProductivityScopeType | '';
}

export interface ApplicationProductivityRule {
  id: string;
  companyId: string | null;
  scopeType: ProductivityScopeType;
  applicationName: string;
  normalizedName: string;
  category: ProductivityCategory;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteProductivityRule {
  id: string;
  companyId: string | null;
  scopeType: ProductivityScopeType;
  hostname: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  notes: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationProductivityPayload {
  applicationName: string;
  category: ProductivityCategory;
  notes?: string;
  enabled?: boolean;
  companyId?: string;
}

export interface WebsiteProductivityPayload {
  hostname: string;
  category: ProductivityCategory;
  notes?: string;
  enabled?: boolean;
  companyId?: string;
}

export interface ProductivityClassificationResult {
  category: ProductivityCategory;
  normalizedValue: string;
  ruleId: string | null;
  matchedScope: 'GLOBAL' | 'COMPANY' | 'NONE';
}
export interface MonitoringIdleParams {
  page: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  employeeId?: string;
  departmentId?: string;
  branchId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  idlePercentageMin?: number;
}

export interface MonitoringIdleOrgUnit {
  id: string;
  name: string;
  code: string;
}

export interface MonitoringIdleEmployeeRow {
  employeeId: string;
  employeeCode: string;
  employee: MonitoringEmployee;
  department: MonitoringIdleOrgUnit | null;
  branch: MonitoringIdleOrgUnit | null;
  activeSeconds: number;
  idleSeconds: number;
  onlineSeconds: number;
  idlePercentage: number;
  longestIdleSeconds: number;
  sessions: number;
}

export interface MonitoringIdleTimelineSegment {
  employeeId: string;
  type: 'ACTIVE' | 'IDLE';
  start: string;
  end: string;
  durationSeconds: number;
  source: 'ACTIVITY_SESSION';
  activitySessionId: string | null;
}

export interface MonitoringIdleLongestPeriod {
  id: string;
  employeeId: string;
  employeeCode: string;
  employee: MonitoringEmployee;
  department: MonitoringIdleOrgUnit | null;
  branch: MonitoringIdleOrgUnit | null;
  start: string;
  end: string;
  durationSeconds: number;
}

export interface MonitoringIdleResponse {
  summary: {
    totalActiveSeconds: number;
    totalIdleSeconds: number;
    idlePercentage: number;
    employeesWithHighIdle: number;
    averageIdleSeconds: number;
    totalSessions: number;
  };
  employees: MonitoringIdleEmployeeRow[];
  timeline: MonitoringIdleTimelineSegment[];
  longestIdlePeriods: MonitoringIdleLongestPeriod[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  range: {
    from: string;
    to: string;
  };
}
export interface MonitoringSummaryRecord {
  employee: MonitoringSummaryEmployee;
  devices: MonitoringDevice[];
  latestHeartbeat: {
    id: string;
    recordedAt: string;
    deviceId: string;
    employeeId: string;
  } | null;
  activity: {
    sessions: number;
    activeSeconds: number;
    idleSeconds: number;
  };
  screenshots: number;
  applications: {
    entries: number;
    durationSeconds: number;
  };
  websites: {
    entries: number;
    durationSeconds: number;
  };
}

export interface MonitoringSummaryResponse extends PaginatedMonitoringResponse<MonitoringSummaryRecord> {
  inputTotals?: {
    totalKeyboardCount: number | null;
    totalMouseClickCount: number | null;
    totalMouseMoveCount: number | null;
    totalScrollCount: number | null;
  };
  topWebsites?: Array<{
    domain: string;
    durationSeconds: number;
    entries: number;
  }>;
  teamActivityBreakdown?: Array<{
    departmentId: string | null;
    departmentName: string;
    employeeCount: number;
    onlineSeconds: number;
    activeSeconds: number;
    idleSeconds: number;
    activityPercentage: number;
  }>;
  range: {
    from?: string;
    to?: string;
  };
}

export interface MonitoringTimelineParams {
  page: number;
  limit: number;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  teamOnly?: boolean;
  search?: string;
}

export type MonitoringTimelineSegmentType = 'ACTIVE' | 'IDLE' | 'BREAK' | 'OFFLINE' | 'NO_ACTIVITY';

export type MonitoringTimelineSegmentSource = 'HEARTBEAT' | 'ACTIVITY' | 'ATTENDANCE' | 'BREAK';

export type MonitoringTimelineMarkerType =
  | 'PUNCH_IN'
  | 'PUNCH_OUT'
  | 'BREAK_START'
  | 'BREAK_END'
  | 'SCREENSHOT';

export interface MonitoringTimelineSummary {
  activeSeconds: number;
  idleSeconds: number;
  breakSeconds: number;
  offlineSeconds: number;
  workedSeconds: number;
}

export interface MonitoringTimelineSegment {
  type: MonitoringTimelineSegmentType;
  start: string;
  end: string;
  durationSeconds: number;
  intensity: number | null;
  source: MonitoringTimelineSegmentSource;
  applicationName?: string | null;
  domain?: string | null;
  activitySessionId?: string | null;
  deviceId?: string | null;
  metadata?: {
    applicationName?: string;
    domain?: string;
    activitySessionId?: string;
    deviceId?: string;
    [key: string]: unknown;
  } | null;
}

export interface MonitoringTimelineMarker {
  type: MonitoringTimelineMarkerType;
  time: string;
  title: string;
  metadata?: Record<string, unknown> | null;
}

export interface MonitoringTimelineUser {
  name: string;
  email: string;
}

export interface MonitoringTimelineEmployee {
  employeeId: string;
  employeeCode: string;
  user?: MonitoringTimelineUser | null;
  device?: MonitoringDevice | null;
  summary: MonitoringTimelineSummary;
  segments: MonitoringTimelineSegment[];
  markers: MonitoringTimelineMarker[];
}

export interface MonitoringTimelineResponse {
  date: string;
  rangeStart: string;
  rangeEnd: string;
  employees: MonitoringTimelineEmployee[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}



export type DeviceHistoryCategory = 'REGISTRATION' | 'SECURITY' | 'ASSIGNMENT' | 'MONITORING' | 'DEVICE' | 'SYSTEM';

export interface DeviceHistoryParams {
  page: number;
  pageSize?: number;
  limit?: number;
  category?: DeviceHistoryCategory | '';
  actor?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DeviceHistoryActor {
  id: string | null;
  name: string;
  email: string | null;
}

export interface DeviceHistoryItem {
  id: string;
  occurredAt: string;
  actor: DeviceHistoryActor;
  action: string;
  category: DeviceHistoryCategory;
  title: string;
  description: string;
  metadata: Record<string, unknown> | null;
}

export interface DeviceHistoryResponse {
  items: DeviceHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}



export interface ProductivityAnalyticsParams {
  page: number;
  pageSize?: number;
  limit?: number;
  search?: string;
  employeeId?: string;
  departmentId?: string;
  branchId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductivityAnalyticsOrgUnit {
  id: string;
  name: string;
  code: string;
}

export interface ProductivityAnalyticsEmployeeRow {
  employeeId: string;
  employeeCode: string;
  employee: MonitoringEmployee;
  department: ProductivityAnalyticsOrgUnit | null;
  branch: ProductivityAnalyticsOrgUnit | null;
  productiveSeconds: number;
  neutralSeconds: number;
  unproductiveSeconds: number;
  unclassifiedSeconds: number;
  productivityPercentage: number;
  topProductiveApp: string | null;
  topProductiveWebsite: string | null;
}

export interface ProductivityAnalyticsApplicationItem {
  name: string;
  normalizedName: string;
  category: ProductivityCategory;
  durationSeconds: number;
  employeeCount: number;
}

export interface ProductivityAnalyticsWebsiteItem {
  hostname: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  durationSeconds: number;
  employeeCount: number;
}

export interface ProductivityAnalyticsDepartment {
  department: ProductivityAnalyticsOrgUnit | null;
  employeeCount: number;
  productivityPercentage: number;
  productiveSeconds: number;
  unproductiveSeconds: number;
}

export interface ProductivityAnalyticsTimelineSegment {
  employeeId: string;
  category: ProductivityCategory;
  source: 'APPLICATION' | 'WEBSITE';
  start: string;
  end: string;
  durationSeconds: number;
  title: string;
  metadata: Record<string, string | null> | null;
}

export interface ProductivityAnalyticsResponse {
  summary: {
    totalProductiveSeconds: number;
    totalNeutralSeconds: number;
    totalUnproductiveSeconds: number;
    totalUnclassifiedSeconds: number;
    productivityPercentage: number;
    averageProductivityPercentage: number;
  };
  employees: ProductivityAnalyticsEmployeeRow[];
  topProductiveApps: ProductivityAnalyticsApplicationItem[];
  topNeutralApps: ProductivityAnalyticsApplicationItem[];
  topUnproductiveApps: ProductivityAnalyticsApplicationItem[];
  topProductiveWebsites: ProductivityAnalyticsWebsiteItem[];
  topNeutralWebsites: ProductivityAnalyticsWebsiteItem[];
  topUnproductiveWebsites: ProductivityAnalyticsWebsiteItem[];
  departments: ProductivityAnalyticsDepartment[];
  timeline: ProductivityAnalyticsTimelineSegment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  range: {
    from: string;
    to: string;
  };
}

export type ProductivityUsageSource = 'APPLICATION' | 'WEBSITE' | 'ALL';

export interface ProductivityEmployeeDetailsParams extends ProductivityAnalyticsParams {
  category?: ProductivityCategory | '';
  source?: ProductivityUsageSource;
}

export interface ProductivityEmployeeUsageItem {
  name: string;
  normalizedName: string;
  category: ProductivityCategory;
  durationSeconds: number;
  usageCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProductivityEmployeeWebsiteUsageItem {
  hostname: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  durationSeconds: number;
  usageCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProductivityEmployeeTimelineItem {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  source: 'APPLICATION' | 'WEBSITE';
  displayName: string;
  category: ProductivityCategory;
}

export interface ProductivityEmployeeDetailsResponse {
  employee: MonitoringEmployee;
  department: ProductivityAnalyticsOrgUnit | null;
  branch: ProductivityAnalyticsOrgUnit | null;
  range: { from: string; to: string };
  summary: {
    productiveSeconds: number;
    neutralSeconds: number;
    unproductiveSeconds: number;
    unclassifiedSeconds: number;
    classifiedSeconds: number;
    totalSeconds: number;
    productivityPercentage: number;
    classificationCoveragePercentage: number;
  };
  applications: ProductivityEmployeeUsageItem[];
  websites: ProductivityEmployeeWebsiteUsageItem[];
  timeline: ProductivityEmployeeTimelineItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ProductivityCoverageParams extends ProductivityAnalyticsParams {}

export interface ProductivityCoverageApplication {
  name: string;
  normalizedName: string;
  durationSeconds: number;
  employeeCount: number;
  usageCount: number;
  lastSeenAt: string;
}

export interface ProductivityCoverageWebsite {
  hostname: string;
  normalizedHostname: string;
  durationSeconds: number;
  employeeCount: number;
  usageCount: number;
  lastSeenAt: string;
}

export interface ProductivityEmployeeCoverageRow {
  employeeId: string;
  employeeCode: string;
  employee: MonitoringEmployee;
  department: ProductivityAnalyticsOrgUnit | null;
  branch: ProductivityAnalyticsOrgUnit | null;
  classifiedSeconds: number;
  unclassifiedSeconds: number;
  coveragePercentage: number;
}

export interface ProductivityCoverageResponse {
  summary: {
    totalTrackedSeconds: number;
    classifiedSeconds: number;
    unclassifiedSeconds: number;
    classificationCoveragePercentage: number;
    unclassifiedApplicationCount: number;
    unclassifiedWebsiteCount: number;
    employeesAffected: number;
  };
  topUnclassifiedApplications: ProductivityCoverageApplication[];
  topUnclassifiedWebsites: ProductivityCoverageWebsite[];
  employeeCoverage: ProductivityEmployeeCoverageRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  range: { from: string; to: string };
}

export type ProductivityTrendGroupBy = 'DAY' | 'WEEK' | 'MONTH';

export interface ProductivityTrendsParams extends ProductivityAnalyticsParams {
  groupBy?: ProductivityTrendGroupBy;
}

export interface ProductivityTrendSummary {
  productivityPercentage: number;
  coveragePercentage: number;
  productiveSeconds: number;
  neutralSeconds: number;
  unproductiveSeconds: number;
  unclassifiedSeconds: number;
  totalSeconds: number;
}

export interface ProductivityTrendPoint extends ProductivityTrendSummary {
  bucket: string;
  start: string;
  end: string;
}

export interface ProductivityDepartmentTrendPoint extends ProductivityTrendPoint {
  department: ProductivityAnalyticsOrgUnit | null;
}

export interface ProductivityEmployeeTrendPoint extends ProductivityTrendPoint {
  employeeId: string;
  employeeCode: string;
  employee: MonitoringEmployee;
  department: ProductivityAnalyticsOrgUnit | null;
  branch: ProductivityAnalyticsOrgUnit | null;
}

export interface ProductivityRankingEmployee extends ProductivityAnalyticsEmployeeRow {
  coveragePercentage: number;
  changePercentage: number;
}

export interface ProductivityRankingDepartment extends ProductivityAnalyticsDepartment {
  coveragePercentage: number;
  changePercentage: number;
}

export interface ProductivityBenchmarks {
  companyAverageProductivity: number;
  companyAverageCoverage: number;
  selectedDepartmentProductivity: number | null;
  selectedDepartmentCoverage: number | null;
  selectedEmployeeProductivity: number | null;
  selectedEmployeeCoverage: number | null;
}

export interface ProductivityTrendsResponse {
  summary: ProductivityTrendSummary;
  trendPoints: ProductivityTrendPoint[];
  departmentTrend: ProductivityDepartmentTrendPoint[];
  employeeTrend: ProductivityEmployeeTrendPoint[];
  topProductiveEmployees: ProductivityRankingEmployee[];
  bottomProductivityEmployees: ProductivityRankingEmployee[];
  topProductiveDepartments: ProductivityRankingDepartment[];
  bottomProductivityDepartments: ProductivityRankingDepartment[];
  mostImprovedEmployees: ProductivityRankingEmployee[];
  largestProductivityDrop: ProductivityRankingEmployee[];
  benchmarks: ProductivityBenchmarks;
  groupBy: ProductivityTrendGroupBy;
  range: { from: string; to: string };
}

export type MonitoringAlertType =
  | 'DEVICE_OFFLINE'
  | 'MISSING_HEARTBEAT'
  | 'MONITORING_DISABLED'
  | 'DEVICE_REVOKED'
  | 'REREGISTRATION_REQUIRED'
  | 'EXCESSIVE_IDLE'
  | 'SCREENSHOT_MISSING';

export type MonitoringAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type MonitoringAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type MonitoringAlertEventType = 'DETECTED' | 'REDETECTED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'AUTO_RESOLVED' | 'REOPENED';

export interface MonitoringAlertParams {
  page: number;
  limit?: number;
  pageSize?: number;
  search?: string;
  status?: MonitoringAlertStatus | '';
  severity?: MonitoringAlertSeverity | '';
  type?: MonitoringAlertType | '';
  employeeId?: string;
  deviceId?: string;
  branchId?: string;
  departmentId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MonitoringAlertUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface MonitoringAlertEmployee {
  id: string;
  employeeCode: string;
  user: MonitoringAlertUser;
  department?: { id: string; name: string; code: string } | null;
  branch?: { id: string; name: string; code: string } | null;
}

export interface MonitoringAlertDevice {
  id: string;
  deviceName: string;
  platform: string;
  status: MonitoringDeviceStatus;
  lastSeenAt?: string | null;
}

export interface MonitoringAlertEvent {
  id: string;
  type: MonitoringAlertEventType;
  actor?: MonitoringAlertUser | null;
  occurredAt: string;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MonitoringAlert {
  id: string;
  companyId: string;
  employeeId?: string | null;
  deviceId?: string | null;
  type: MonitoringAlertType;
  severity: MonitoringAlertSeverity;
  status: MonitoringAlertStatus;
  title: string;
  message: string;
  detectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  employee?: MonitoringAlertEmployee | null;
  device?: MonitoringAlertDevice | null;
  acknowledgedBy?: MonitoringAlertUser | null;
  resolvedBy?: MonitoringAlertUser | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringAlertDetail extends MonitoringAlert {
  events: MonitoringAlertEvent[];
}

export interface MonitoringAlertSummary {
  open: number;
  acknowledged: number;
  criticalOpen: number;
  warningOpen: number;
  resolvedToday: number;
  totalFiltered: number;
}

export interface MonitoringAlertListResponse extends PaginatedMonitoringResponse<MonitoringAlert> {
  summary: MonitoringAlertSummary;
}

export interface MonitoringAlertActionPayload {
  note?: string;
  resolutionNote?: string;
}

export interface MonitoringAlertEvaluationResponse {
  evaluatedAt: string;
  detected: number;
  resolved: number;
}

export type MonitoringAlertPolicyScope = 'SYSTEM' | 'COMPANY' | 'BRANCH' | 'DEPARTMENT' | 'EMPLOYEE';

export interface AlertTypePolicySetting {
  enabled?: boolean;
  severity?: MonitoringAlertSeverity;
  thresholdMinutes?: number;
  gracePeriodMinutes?: number;
  workingHoursOnly?: boolean;
  weekendEnabled?: boolean;
  maintenanceIgnore?: boolean;
  autoResolve?: boolean;
}

export type MonitoringAlertPolicySettings = Partial<Record<MonitoringAlertType, AlertTypePolicySetting>>;

export interface MonitoringAlertPolicy {
  id: string;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  employeeId?: string | null;
  name: string;
  description?: string | null;
  enabled: boolean;
  priority: number;
  scope: MonitoringAlertPolicyScope;
  settings: MonitoringAlertPolicySettings;
  maintenanceStart?: string | null;
  maintenanceEnd?: string | null;
  maintenanceReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringAlertPolicyParams {
  page: number;
  limit?: number;
  search?: string;
  scope?: MonitoringAlertPolicyScope | '';
  enabled?: boolean | '';
}

export interface MonitoringAlertPolicyPayload {
  name: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  scope: MonitoringAlertPolicyScope;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  settings: MonitoringAlertPolicySettings;
  maintenanceStart?: string;
  maintenanceEnd?: string;
  maintenanceReason?: string;
}

export interface MonitoringAlertPolicyListResponse extends PaginatedMonitoringResponse<MonitoringAlertPolicy> {}

export type OperationsGroupBy = 'DAY' | 'WEEK' | 'MONTH';

export interface MonitoringOperationsParams {
  dateFrom?: string;
  dateTo?: string;
  groupBy?: OperationsGroupBy;
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  alertType?: MonitoringAlertType;
  severity?: MonitoringAlertSeverity;
  status?: MonitoringAlertStatus;
}

export interface OperationsKpis {
  openAlerts: number;
  criticalAlerts: number;
  acknowledgedAlerts: number;
  resolvedToday: number;
  unreadNotifications: number;
  notificationSuccessPercentage: number;
  emailDeliverySuccessPercentage: number;
  averageMttaMinutes: number | null;
  averageMttrMinutes: number | null;
  monitoringCoveragePercentage: number;
  productivityCoveragePercentage: number;
}

export interface OperationsTrendPoint {
  bucket: string;
  openAlerts: number;
  resolvedAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
}

export interface OperationsSlaMetric {
  averageMinutes: number | null;
  medianMinutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  samples: number;
  distribution: Array<{ label: string; count: number }>;
}

export interface OperationsRankingItem {
  id: string;
  label: string;
  count: number;
  secondary?: string | null;
}

export interface MonitoringOperationsDashboard {
  kpis: OperationsKpis;
  trend: OperationsTrendPoint[];
  heatmaps: Record<string, Array<{ label: string; count: number }>>;
  rankings: Record<string, OperationsRankingItem[]>;
  sla: { mtta: OperationsSlaMetric; mttr: OperationsSlaMetric };
  monitoringHealth: {
    devicesOnline: number;
    devicesOffline: number;
    devicesRevoked: number;
    heartbeatHealthy: number;
    screenshotHealthy: number;
    monitoringEnabledPercentage: number;
    policyCoveragePercentage: number;
  };
  notificationAnalytics: {
    inAppSent: number;
    emailSent: number;
    emailFailed: number;
    pendingRetry: number;
    retrySuccessPercentage: number;
    averageDeliverySeconds: number | null;
    deliveryFailurePercentage: number;
  };
  executiveSummary: { score: number; rating: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical'; formula: string };
  generatedAt: string;
}
