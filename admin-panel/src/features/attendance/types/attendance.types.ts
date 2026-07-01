export type AttendanceStatus = 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'AUTO_PUNCHED_OUT';

export type AttendanceCurrentState =
  | 'READY_TO_PUNCH_IN'
  | 'PUNCHED_IN'
  | 'ON_BREAK'
  | 'PUNCHED_OUT'
  | 'AUTO_PUNCHED_OUT';

export interface AttendanceEmployee {
  id: string;
  employeeCode: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface AttendanceLog {
  id: string;
  attendanceId: string;
  type: 'PUNCH_IN' | 'PUNCH_OUT';
  occurredAt: string;
  note?: string | null;
}

export interface AttendanceBreak {
  id: string;
  attendanceId: string;
  breakPolicyId?: string | null;
  breakTypeName?: string | null;
  breakTypeCode?: string | null;
  allowedMinutes?: number | null;
  isPaid?: boolean | null;
  durationMinutes?: number | null;
  policyViolated?: boolean | null;
  note?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  autoPunchOutAt?: string | null;
  breakPolicy?: {
    id: string;
    name: string;
    code: string;
    allowedMinutes: number;
    isPaid: boolean;
    autoPunchOutOnTimeout: boolean;
  } | null;
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  attendanceDate: string;
  punchInAt?: string | null;
  punchOutAt?: string | null;
  status: AttendanceStatus;
  workedMinutes?: number | null;
  breakMinutes?: number | null;
  lateMinutes?: number | null;
  expectedMinutes?: number | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  shiftTimezone?: string | null;
  notes?: string | null;
  autoPunchOutReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  employee?: AttendanceEmployee | null;
  logs?: AttendanceLog[];
  breaks?: AttendanceBreak[];
  isOpen?: boolean;
}

export interface AttendanceDetail extends AttendanceRecord {
  employeeCode: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  shift: {
    startTime: string;
    endTime: string;
    timezone: string;
  };
  logs: AttendanceLog[];
  breaks: AttendanceBreak[];
}

export type AttendanceTimelineEventType =
  | 'PUNCH_IN'
  | 'PUNCH_OUT'
  | 'BREAK_START'
  | 'BREAK_END'
  | 'AUTO_PUNCH_OUT'
  | 'HEARTBEAT_LOST';

export type AttendanceTimelineEventSource = 'ATTENDANCE' | 'BREAK' | 'SYSTEM' | 'MONITORING';

export interface AttendanceTimelineEvent {
  eventId: string;
  type: AttendanceTimelineEventType;
  time: string;
  title: string;
  description: string;
  source: AttendanceTimelineEventSource;
  metadata: Record<string, unknown>;
}

export interface AttendanceTimeline {
  attendanceId: string;
  events: AttendanceTimelineEvent[];
}

export interface AttendanceListParams {
  page: number;
  limit: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
  status?: AttendanceStatus;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AttendanceSummary {
  date: string;
  serverNow?: string;
  totalEmployees?: number;
  recorded?: number;
  counts?: Partial<Record<AttendanceStatus, number>>;
  sessions?: AttendanceRecord[];
  latestSession?: AttendanceRecord | null;
  canPunchIn?: boolean;
  currentState?: AttendanceCurrentState;
  totalWorkedSeconds?: number;
  totalBreakSeconds?: number;
  totalWorkedMinutes?: number;
  totalBreakMinutes?: number;
  autoPunchedOut?: boolean;
}
