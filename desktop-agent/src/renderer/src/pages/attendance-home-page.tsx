import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { environment } from '../config/environment';
import { useAuth } from '../context/auth-context';
import { attendanceService } from '../services/api/attendance.service';
import { deviceService, type DeviceState } from '../services/api/device.service';
import { employeeService } from '../services/api/employee.service';
import { heartbeatApiService, type HeartbeatPayload } from '../services/api/heartbeat.service';
import { HeartbeatService } from '../services/monitoring/heartbeat.service';
import { OfflineQueueService } from '../services/offline/offline-queue.service';
import { SyncManager } from '../services/offline/sync-manager';
import type { AttendanceRecord, EmployeeProfile } from '../types/api';
import {
  activeBreak,
  formatDuration,
  totalBreakSeconds,
  workingSeconds,
} from '../utils/attendance-time';

type BusyAction = 'loading' | 'punchIn' | 'punchOut' | null;

export function AttendanceHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [busy, setBusy] = useState<BusyAction>('loading');
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => new Date());
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
      await attendanceService.getSummary();
      const [profile, registeredDevice, today, latest] = await Promise.all([
        employeeService.getCurrent(user),
        deviceService.register(),
        attendanceService.getToday(),
        attendanceService.getLatest(),
      ]);
      setEmployee(profile);
      setDevice(registeredDevice);
      setAttendance(today);
      const autoPunchedRecord = [today, latest].find(
        (record) =>
          record?.status === 'AUTO_PUNCHED_OUT' &&
          record.autoPunchOutReason === 'Device offline / heartbeat lost',
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

  const isWorking = Boolean(attendance?.punchInAt && !attendance.punchOutAt);
  const isCompleted = Boolean(attendance?.punchOutAt);
  const statusText = useMemo(() => {
    if (attendance?.status === 'AUTO_PUNCHED_OUT') return 'Auto punched out';
    if (isCompleted) return 'Punched out';
    if (isWorking) return 'Currently working';
    return 'Ready to punch in';
  }, [attendance?.status, isCompleted, isWorking]);

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

  async function punchIn() {
    setBusy('punchIn');
    setMessage('');
    try {
      setAttendance(await attendanceService.punchIn());
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Punch out failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="attendance-home compact-page">
      <div className="status-row">
        <span className={`status-dot ${isWorking ? 'online' : ''}`} />
        <span>{statusText}</span>
      </div>

      <div className="timer-block">
        <span>Working time</span>
        <strong>{formatDuration(workingSeconds(attendance, now))}</strong>
      </div>

      <div className="mini-stats">
        <div>
          <span>Employee</span>
          <strong>{employee?.employeeCode ?? 'Not linked'}</strong>
        </div>
        <div>
          <span>Breaks</span>
          <strong>{formatDuration(totalBreakSeconds(attendance, now))}</strong>
        </div>
        <div>
          <span>Device</span>
          <strong>{device?.registration.status ?? 'Syncing'}</strong>
        </div>
      </div>

      {!isWorking && (
        <button
          className="action-button action-green"
          disabled={Boolean(busy) || isCompleted}
          onClick={() => void punchIn()}
        >
          {isCompleted ? 'Punched Out' : busy === 'punchIn' ? 'Punching In...' : 'Punch In'}
        </button>
      )}

      {isWorking && (
        <div className="action-stack">
          <button
            className="action-button action-red"
            disabled={Boolean(busy)}
            onClick={() => void punchOut()}
          >
            {busy === 'punchOut' ? 'Punching Out...' : 'Punch Out'}
          </button>
          <button
            className="action-button action-blue"
            disabled={Boolean(busy)}
            onClick={() => navigate('/break')}
          >
            Start Break
          </button>
        </div>
      )}

      <button className="refresh-link" onClick={() => void load()}>
        Refresh status
      </button>
      {message && <p className="status-message">{message}</p>}
    </section>
  );
}
