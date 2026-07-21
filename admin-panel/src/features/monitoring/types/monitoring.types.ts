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

export type MonitoringDeviceStatus = 'ACTIVE' | 'INACTIVE' | 'REVOKED';

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
  hostname: string;
  platform: string;
  osVersion: string | null;
  agentVersion: string | null;
  status: MonitoringDeviceStatus;
  lastHeartbeatAt: string | null;
  registeredAt: string;
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
