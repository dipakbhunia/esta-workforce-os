import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { attendanceService } from '../services/api/attendance.service';
import { deviceService, type DeviceState } from '../services/api/device.service';
import { employeeService } from '../services/api/employee.service';
import type { AttendanceRecord, EmployeeProfile } from '../types/api';

type Action = 'punchIn' | 'punchOut' | 'breakStart' | 'breakEnd';

export function DashboardPage() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [busy, setBusy] = useState<Action | 'loading' | null>('loading');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setBusy('loading');
    setMessage('');
    try {
      const [profile, registeredDevice, today] = await Promise.all([
        employeeService.getCurrent(user),
        deviceService.register(),
        attendanceService.getToday(),
      ]);
      setEmployee(profile);
      setDevice(registeredDevice);
      setAttendance(today);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to load');
    } finally {
      setBusy(null);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const attendanceLabel = useMemo(() => {
    if (!attendance) return 'Not punched in';
    if (attendance.breaks.some((entry) => !entry.endedAt)) return 'On break';
    if (!attendance.punchOutAt) return 'Punched in';
    return `Completed: ${attendance.status.replace('_', ' ')}`;
  }, [attendance]);

  async function runAction(action: Action) {
    setBusy(action);
    setMessage('');
    try {
      const next = await attendanceService[action]();
      setAttendance(next);
      setMessage('Attendance updated.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Desktop foundation</p>
          <h2>Dashboard</h2>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <div className="card-grid">
        <article className="card">
          <span>Employee</span>
          <strong>
            {user?.firstName} {user?.lastName}
          </strong>
          <small>{employee?.employeeCode ?? 'No employee profile'}</small>
          <small>{employee?.company.name ?? 'Company unavailable'}</small>
        </article>
        <article className="card">
          <span>Device</span>
          <strong>{device?.information.name ?? 'Registering...'}</strong>
          <small>{device?.registration.status ?? 'Unknown'}</small>
          <small>{device?.information.platform ?? 'Platform unavailable'}</small>
        </article>
        <article className="card">
          <span>Attendance</span>
          <strong>{attendanceLabel}</strong>
          <small>
            {attendance?.punchInAt
              ? `Started ${new Date(attendance.punchInAt).toLocaleTimeString()}`
              : 'No session today'}
          </small>
        </article>
        <article className="card">
          <span>Sync status</span>
          <strong>{navigator.onLine ? 'Online' : 'Offline'}</strong>
          <small>Monitoring sync is not enabled.</small>
        </article>
      </div>

      <div className="attendance-panel">
        <h3>Attendance controls</h3>
        <div className="button-row">
          <button
            className="primary"
            disabled={Boolean(busy)}
            onClick={() => void runAction('punchIn')}
          >
            Punch In
          </button>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => void runAction('punchOut')}
          >
            Punch Out
          </button>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => void runAction('breakStart')}
          >
            Break Start
          </button>
          <button
            className="secondary"
            disabled={Boolean(busy)}
            onClick={() => void runAction('breakEnd')}
          >
            Break End
          </button>
        </div>
        {message && <p className="status-message">{message}</p>}
      </div>
    </section>
  );
}
