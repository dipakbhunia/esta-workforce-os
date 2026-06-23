import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { attendanceService } from '../services/api/attendance.service';
import type { AttendanceRecord } from '../types/api';
import {
  breakSeconds,
  formatDuration,
  totalBreakSeconds,
} from '../utils/attendance-time';

export function BreakActivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const breakType =
    (location.state as { breakType?: string } | null)?.breakType ?? 'Break';
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

  return (
    <section className="compact-page break-active">
      <div className="status-row">
        <span className="status-dot break" />
        <span>{breakType} active</span>
      </div>
      <div className="timer-block">
        <span>Current break</span>
        <strong>{formatDuration(breakSeconds(attendance, now))}</strong>
      </div>
      <div className="break-total">
        <span>Total break today</span>
        <strong>{formatDuration(totalBreakSeconds(attendance, now))}</strong>
      </div>
      <button
        className="action-button action-yellow"
        disabled={ending}
        onClick={() => void endBreak()}
      >
        {ending ? 'Ending...' : 'End Break'}
      </button>
      {message && <p className="error">{message}</p>}
    </section>
  );
}
