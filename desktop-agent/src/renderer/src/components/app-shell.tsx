import { ArrowLeft, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { attendanceService } from '../services/api/attendance.service';
import { deviceService } from '../services/api/device.service';
import { ActivityCollector } from '../services/monitoring/activity.service';

const iconProps = { size: 20, strokeWidth: 2.2, 'aria-hidden': true } as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onSettings = location.pathname === '/settings';
  const collector = useRef<ActivityCollector | null>(null);
  const lifecycleTimer = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    async function syncCollectorState() {
      if (!user || disposed) return;
      try {
        const summary = await attendanceService.getSummary();
        const shouldCollect =
          summary.currentState === 'PUNCHED_IN' ||
          summary.currentState === 'ON_BREAK';

        if (shouldCollect && !collector.current) {
          const device = await deviceService.register();
          if (disposed) return;
          const nextCollector = new ActivityCollector(device);
          collector.current = nextCollector;
          await nextCollector.start();
          return;
        }

        if (!shouldCollect && collector.current) {
          await stopActivityCollector();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('[Esta Desktop] Activity collector lifecycle check failed', error);
        }
      }
    }

    void syncCollectorState();
    lifecycleTimer.current = window.setInterval(() => {
      void syncCollectorState();
    }, 15000);

    return () => {
      disposed = true;
      if (lifecycleTimer.current !== null) {
        window.clearInterval(lifecycleTimer.current);
        lifecycleTimer.current = null;
      }
      void stopActivityCollector();
    };
  }, [user]);

  async function stopActivityCollector(): Promise<void> {
    const activeCollector = collector.current;
    collector.current = null;
    await activeCollector?.stop();
  }

  async function signOut(): Promise<void> {
    await stopActivityCollector();
    await logout();
  }

  return (
    <div className="agent-shell">
      <header className="agent-header">
        <div className="avatar" aria-hidden="true">
          {initials(user?.firstName, user?.lastName)}
        </div>
        <div className="identity">
          <strong>
            {user?.firstName} {user?.lastName}
          </strong>
          <span>{user?.email}</span>
        </div>
        <Link
          className="icon-button"
          to={onSettings ? '/' : '/settings'}
          aria-label={onSettings ? 'Back to attendance' : 'Settings'}
          title={onSettings ? 'Back to attendance' : 'Settings'}
        >
          {onSettings ? <ArrowLeft {...iconProps} /> : <SettingsIcon {...iconProps} />}
        </Link>
      </header>
      <main className="agent-content">
        <Outlet />
      </main>
      <footer className="agent-footer">
        <button className="sign-out-button" onClick={() => void signOut()}>
          <span className="button-content">
            <LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
            Sign out
          </span>
        </button>
        <span>Esta Workforce OS Agent</span>
      </footer>
    </div>
  );
}

function initials(firstName = '', lastName = ''): string {
  const first = firstName.trim()[0] ?? 'E';
  const last = lastName.trim()[0] ?? '';
  return `${first}${last}`.toUpperCase();
}
