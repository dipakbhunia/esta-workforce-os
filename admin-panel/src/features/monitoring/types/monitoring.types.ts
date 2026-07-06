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
  mouseClickCount: number | null;
  applications: MonitoringApplicationUsage[];
  websites: MonitoringWebsiteUsage[];
}

export interface MonitoringScreenshot {
  id: string;
  employee?: MonitoringEmployee | null;
  deviceId: string;
  capturedAt: string;
  storageKey: string;
  thumbnailUrl: string | null;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
}
