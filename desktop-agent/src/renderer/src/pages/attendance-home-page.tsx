import { Coffee, Play, RotateCw, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DesktopSettings } from '@shared/contracts';
import { environment } from '../config/environment';
import { useAuth } from '../context/auth-context';
import { attendanceService } from '../services/api/attendance.service';
import { deviceService, type DeviceState } from '../services/api/device.service';
import { employeeService } from '../services/api/employee.service';
import {
  heartbeatApiService,
  type HeartbeatPayload,
} from '../services/api/heartbeat.service';
import { liveStatusService } from '../services/api/live-status.service';
import { HeartbeatService } from '../services/monitoring/heartbeat.service';
import { OfflineQueueService } from '../services/offline/offline-queue.service';
import { SyncManager } from '../services/offline/sync-manager';
import type {
  AttendanceRecord,
  AttendanceSummary,
  EmployeeProfile,
  LiveStatusResponse,
} from '../types/api';
import {
  activeBreak,
  formatDuration,
  summaryBreakSeconds,
  summaryWorkingSeconds,
} from '../utils/attendance-time';

type BusyAction = 'loading' | 'punchIn' | 'punchOut' | null;
type IdleModalMode = 'warning' | 'punchedOut' | null;

const IDLE_NOTE = 'Auto punched out due to idle time';
const OFFLINE_NOTE = 'Device offline / heartbeat lost';
const IDLE_CHECK_INTERVAL_MS = 15000;
const IDLE_WARNING_COUNTDOWN_SECONDS = 60;
const actionIconProps = { size: 20, strokeWidth: 2.2, 'aria-hidden': true } as const;

export function AttendanceHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceSummary, setAttendanceSummary] =
    useState<AttendanceSummary | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatusResponse | null>(null);
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [message, setMessage] = useState('');
  const [idleModalMode, setIdleModalMode] = useState<IdleModalMode>(null);
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState<number | null>(null);
  const [idleAutoPunchedOut, setIdleAutoPunchedOut] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const idlePunchOutRunning = useRef(false);
  const idleWarningActive = useRef(false);
  const heartbeatQueue = useRef(new OfflineQueueService());
  const syncManager = useRef(
    new SyncManager(heartbeatQueue.current, {
      heartbeat: async (item) => {
        await heartbeatApiService.send(item.payload as HeartbeatPayload);
      },
    }),
  );
  const heartbeatService = useRef<HeartbeatService | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy('loading');
    setMessage('');
    try {
      const [loadedSettings, summary] = await Promise.all([
        window.esta.settings.get(),
        attendanceService.getSummary(),
      ]);
      const [profile, registeredDevice, today, latest] = await Promise.all([
        employeeService.getCurrent(user),
        deviceService.register(),
        attendanceService.getToday(),
        attendanceService.getLatest(),
      ]);
      const loadedLiveStatus = profile
        ? await liveStatusService.getByEmployee(profile.id).catch(() => null)
        : null;
      setSettings(loadedSettings);
      setEmployee(profile);
      setDevice(registeredDevice);
      setAttendanceSummary(summary);
      setLiveStatus(loadedLiveStatus);
      setAttendance(summary.latestSession ?? today);
      setIdleAutoPunchedOut(false);
      const autoPunchedRecord = [summary.latestSession, today, latest].find(
        (record) =>
          record?.status === 'AUTO_PUNCHED_OUT' &&
          record.autoPunchOutReason === OFFLINE_NOTE,
      );
      if (autoPunchedRecord) {
        setMessage('Auto punched out due to device offline');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load attendance');
    } finally {
      setBusy(null);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeBreak(attendance)) navigate('/break-active', { replace: true });
  }, [attendance, navigate]);

  const isWorking = attendanceSummary
    ? ['PUNCHED_IN', 'ON_BREAK'].includes(attendanceSummary.currentState)
    : Boolean(attendance?.punchInAt && !attendance.punchOutAt);
  const isOnBreak = attendanceSummary?.currentState === 'ON_BREAK';
  const isCompleted = attendanceSummary
    ? ['PUNCHED_OUT', 'AUTO_PUNCHED_OUT'].includes(
        attendanceSummary.currentState,
      )
    : Boolean(attendance?.punchOutAt);
  const canPunchIn = attendanceSummary?.canPunchIn ?? !isCompleted;
  const statusText = useMemo(() => {
    if (idleAutoPunchedOut) return 'Auto punched out due to idle time';
    if (message === 'Auto punched out due to device offline') {
      return 'Auto punched out due to device offline';
    }
    if (liveStatus?.status === 'AWAY') return 'Away - heartbeat delayed';
    if (liveStatus?.status === 'OFFLINE' && isWorking) return 'Offline - waiting for sync';
    if (attendanceSummary?.currentState === 'AUTO_PUNCHED_OUT') {
      return 'Auto punched out';
    }
    if (attendanceSummary?.currentState === 'PUNCHED_OUT') return 'Punched out';
    if (attendanceSummary?.currentState === 'ON_BREAK') return 'On break';
    if (isCompleted) return 'Punched out';
    if (isWorking) return 'Currently working';
    return 'Ready to punch in';
  }, [attendanceSummary?.currentState, idleAutoPunchedOut, isCompleted, isWorking, liveStatus?.status, message]);

  useEffect(() => {
    if (!device || !isWorking) {
      void heartbeatService.current?.stop();
      heartbeatService.current = null;
      return;
    }

    const service = new HeartbeatService(
      heartbeatQueue.current,
      syncManager.current,
      device,
      environment.heartbeatIntervalMs,
    );
    heartbeatService.current = service;
    void service.start();

    return () => {
      void service.stop();
      if (heartbeatService.current === service) heartbeatService.current = null;
    };
  }, [device, isWorking]);

  useEffect(() => {
    const timeoutSeconds = Math.ceil((settings?.idleTimeoutMs ?? 300000) / 1000);
    const shouldMonitorIdle =
      attendanceSummary?.currentState === 'PUNCHED_IN' ||
      attendanceSummary?.currentState === 'ON_BREAK';

    if (!shouldMonitorIdle || timeoutSeconds <= 0) {
      cancelIdleWarning();
      return;
    }

    const checkIdle = async () => {
      const systemIdleSeconds = await window.esta.system.getIdleTimeSeconds();
      if (systemIdleSeconds < timeoutSeconds) {
        cancelIdleWarning();
        return;
      }
      if (!idleWarningActive.current && !idlePunchOutRunning.current) {
        await startIdleWarning();
      }
    };

    void checkIdle();
    const timer = window.setInterval(() => void checkIdle(), IDLE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [attendanceSummary?.currentState, settings?.idleTimeoutMs]);

  useEffect(() => {
    if (idleModalMode !== 'warning') return;

    let remainingSeconds = IDLE_WARNING_COUNTDOWN_SECONDS;
    const timeoutSeconds = Math.ceil((settings?.idleTimeoutMs ?? 300000) / 1000);
    setIdleCountdownSeconds(remainingSeconds);

    const timer = window.setInterval(async () => {
      const systemIdleSeconds = await window.esta.system.getIdleTimeSeconds();
      if (systemIdleSeconds < timeoutSeconds) {
        cancelIdleWarning();
        return;
      }

      remainingSeconds -= 1;
      setIdleCountdownSeconds(remainingSeconds);
      if (remainingSeconds <= 0) {
        window.clearInterval(timer);
        const latestIdleSeconds = await window.esta.system.getIdleTimeSeconds();
        if (latestIdleSeconds >= timeoutSeconds) {
          void autoPunchOutForIdle();
        } else {
          cancelIdleWarning();
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [idleModalMode, settings?.idleTimeoutMs]);

  async function startIdleWarning(): Promise<void> {
    idleWarningActive.current = true;
    setIdleModalMode('warning');
    setIdleCountdownSeconds(IDLE_WARNING_COUNTDOWN_SECONDS);
    await window.esta.app.showAndFocus();
    void playIdleAlertSound();
  }

  function cancelIdleWarning(): void {
    idleWarningActive.current = false;
    setIdleModalMode((current) => (current === 'warning' ? null : current));
    setIdleCountdownSeconds(null);
  }

  async function autoPunchOutForIdle() {
    if (idlePunchOutRunning.current) return;
    idlePunchOutRunning.current = true;
    try {
      if (attendanceSummary?.currentState === 'ON_BREAK') {
        await attendanceService.breakEnd();
      }
      const record = await attendanceService.punchOut(IDLE_NOTE);
      const summary = await attendanceService.getSummary();
      setAttendance(record);
      setAttendanceSummary(summary);
      if (employee) {
        setLiveStatus(await liveStatusService.getByEmployee(employee.id).catch(() => null));
      }
      setIdleAutoPunchedOut(true);
      setIdleModalMode('punchedOut');
      setIdleCountdownSeconds(null);
      setMessage(IDLE_NOTE);
      await window.esta.app.showAndFocus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Idle auto punch-out failed');
      cancelIdleWarning();
    } finally {
      idlePunchOutRunning.current = false;
      idleWarningActive.current = false;
    }
  }

  async function punchIn() {
    setBusy('punchIn');
    setMessage('');
    setIdleAutoPunchedOut(false);
    try {
      setAttendanceSummary(null);
      setAttendance(await attendanceService.punchIn());
      setAttendanceSummary(await attendanceService.getSummary());
      if (employee) {
        setLiveStatus(await liveStatusService.getByEmployee(employee.id).catch(() => null));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Punch in failed');
    } finally {
      setBusy(null);
    }
  }

  async function punchOut() {
    setBusy('punchOut');
    setMessage('');
    try {
      setAttendance(await attendanceService.punchOut());
      setAttendanceSummary(await attendanceService.getSummary());
      if (employee) {
        setLiveStatus(await liveStatusService.getByEmployee(employee.id).catch(() => null));
      }
      cancelIdleWarning();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Punch out failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="attendance-home compact-page">
      <div className="status-row">
        <span className={`status-dot ${isWorking ? 'online' : ''} ${isOnBreak ? 'break' : ''}`} />
        <span>{statusText}</span>
      </div>

      <div className="timer-block">
        <span>Working time</span>
        <strong>{formatDuration(summaryWorkingSeconds(attendanceSummary, now))}</strong>
      </div>

      <div className="mini-stats">
        <div>
          <span>Employee</span>
          <strong>{employee?.employeeCode ?? 'Not linked'}</strong>
        </div>
        <div>
          <span>Breaks</span>
          <strong>{formatDuration(summaryBreakSeconds(attendanceSummary, now))}</strong>
        </div>
        <div>
          <span>Device</span>
          <strong>{liveStatus ? liveStatusLabel(liveStatus) : device?.registration.status ?? 'Syncing'}</strong>
        </div>
      </div>

      {!isWorking && (
        <button
          className="action-button action-green"
          disabled={Boolean(busy) || !canPunchIn}
          onClick={() => void punchIn()}
        >
          <span className="button-content">
            <Play {...actionIconProps} />
            {!canPunchIn ? 'Punched Out' : busy === 'punchIn' ? 'Punching In...' : 'Punch In'}
          </span>
        </button>
      )}

      {isWorking && (
        <div className="action-stack">
          <button
            className="action-button action-red"
            disabled={Boolean(busy)}
            onClick={() => void punchOut()}
          >
            <span className="button-content">
              <Square {...actionIconProps} />
              {busy === 'punchOut' ? 'Punching Out...' : 'Punch Out'}
            </span>
          </button>
          <button
            className="action-button action-blue"
            disabled={Boolean(busy)}
            onClick={() => navigate('/break')}
          >
            <span className="button-content">
              <Coffee {...actionIconProps} />
              Start Break
            </span>
          </button>
        </div>
      )}

      <button className="refresh-link" onClick={() => void load()}>
        <span className="link-button-content">
          <RotateCw size={18} strokeWidth={2.2} aria-hidden="true" />
          Refresh status
        </span>
      </button>
      {message && <p className="status-message">{message}</p>}

      {idleModalMode && (
        <div className="modal-backdrop" role="alertdialog" aria-modal="true">
          <div className="modal-card">
            <p className="eyebrow">
              {idleModalMode === 'warning' ? 'Idle warning' : 'Idle timeout'}
            </p>
            {idleModalMode === 'warning' ? (
              <>
                <h2>You appear idle.</h2>
                <p className="muted setting-note">
                  Activity on your computer will cancel this warning. Auto punch-out in{' '}
                  <strong>{idleCountdownSeconds ?? IDLE_WARNING_COUNTDOWN_SECONDS}s</strong>.
                </p>
              </>
            ) : (
              <h2>You were auto punched out because of idle time.</h2>
            )}
            <button
              className="small-action"
              onClick={() => setIdleModalMode(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

async function playIdleAlertSound(): Promise<void> {
  const audioWindow = window as Window &
    typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = window.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  for (let index = 0; index < 4; index++) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const start = context.currentTime + index * 0.45;
    oscillator.start(start);
    oscillator.stop(start + 0.12);
  }
  window.setTimeout(() => void context.close(), 2500);
}

function liveStatusLabel(status: LiveStatusResponse): string {
  if (status.status === 'WORKING') return 'Live: working';
  if (status.status === 'ON_BREAK') return 'Live: on break';
  if (status.status === 'AWAY') return 'Live: away';
  if (status.status === 'OFFLINE') return 'Offline';
  if (status.status === 'PUNCHED_OUT') return 'Punched out';
  if (status.status === 'AUTO_PUNCHED_OUT') return 'Auto punched out';
  return 'Online';
}
