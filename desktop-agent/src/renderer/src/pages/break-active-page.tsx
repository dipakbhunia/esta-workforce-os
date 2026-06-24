import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { attendanceService } from '../services/api/attendance.service';
import type { AttendanceRecord, BreakPolicy } from '../types/api';
import {
  activeBreak,
  breakSeconds,
  formatDuration,
  latestBreak,
  remainingBreakSeconds,
  totalBreakSeconds,
} from '../utils/attendance-time';

export function BreakActivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routePolicy =
    (location.state as { breakPolicy?: BreakPolicy } | null)?.breakPolicy;
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [message, setMessage] = useState('');
  const [ending, setEnding] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setAttendance(await attendanceService.getToday());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function endBreak() {
    setEnding(true);
    setMessage('');
    try {
      await attendanceService.breakEnd();
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to end break');
    } finally {
      setEnding(false);
    }
  }

  const currentBreak = activeBreak(attendance);
  const displayBreak = currentBreak ?? latestBreak(attendance);
  const breakName =
    displayBreak?.breakTypeName ?? routePolicy?.name ?? 'Break';
  const allowedMinutes =
    displayBreak?.allowedMinutes ?? routePolicy?.allowedMinutes ?? null;
  const remainingSeconds = remainingBreakSeconds(attendance, now);
  const isNearLimit =
    remainingSeconds !== null && remainingSeconds <= 120 && remainingSeconds > 0;
  const isAutoPunchedOut =
    attendance?.status === 'AUTO_PUNCHED_OUT' ||
    Boolean(displayBreak?.autoPunchOutAt);

  return (
    <section className="compact-page break-active">
      <div className="status-row">
        <span className="status-dot break" />
        <span>{isAutoPunchedOut ? 'Break limit exceeded' : `${breakName} active`}</span>
      </div>
      <div className="timer-block">
        <span>{currentBreak ? 'Current break' : 'Last break'}</span>
        <strong>{formatDuration(breakSeconds(attendance, now))}</strong>
      </div>
      <div className={`limit-panel ${isNearLimit ? 'warning' : ''}`}>
        <span>Allowed duration</span>
        <strong>{allowedMinutes ? `${allowedMinutes} min` : 'Policy loading'}</strong>
        {remainingSeconds !== null && (
          <small>
            {isAutoPunchedOut
              ? attendance?.autoPunchOutReason ?? 'Auto punched out'
              : `${formatDuration(remainingSeconds)} remaining`}
          </small>
        )}
      </div>
      <div className="break-total">
        <span>Total break today</span>
        <strong>{formatDuration(totalBreakSeconds(attendance, now))}</strong>
      </div>
      {isNearLimit && (
        <p className="warning-message">Break limit is almost over.</p>
      )}
      {isAutoPunchedOut && (
        <p className="error">
          You were automatically punched out because the break duration exceeded
          the allowed limit.
        </p>
      )}
      <button
        className="action-button action-yellow"
        disabled={ending || isAutoPunchedOut || !currentBreak}
        onClick={() => void endBreak()}
      >
        {ending ? 'Ending...' : 'End Break'}
      </button>
      {message && <p className="error">{message}</p>}
    </section>
  );
}
