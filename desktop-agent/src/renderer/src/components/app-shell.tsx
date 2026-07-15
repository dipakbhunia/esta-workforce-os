import { ArrowLeft, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { attendanceService } from '../services/api/attendance.service';
import { deviceService, type DeviceState } from '../services/api/device.service';
import { ActivityCollector } from '../services/monitoring/activity.service';
import { ScreenshotService } from '../services/monitoring/screenshot.service';

const iconProps = { size: 20, strokeWidth: 2.2, 'aria-hidden': true } as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onSettings = location.pathname === '/settings';
  const collector = useRef<ActivityCollector | null>(null);
  const screenshotService = useRef<ScreenshotService | null>(null);
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
        const shouldCaptureScreenshots = summary.currentState === 'PUNCHED_IN';
        let device: DeviceState | null = null;

        if (shouldCollect && !collector.current) {
          device = await deviceService.register();
          if (disposed) return;
          const nextCollector = new ActivityCollector(device, {
            inputEnabled: summary.currentState === 'PUNCHED_IN',
          });
          collector.current = nextCollector;
          await nextCollector.start();
        }

        if (shouldCollect && collector.current) {
          await collector.current.setInputEnabled(summary.currentState === 'PUNCHED_IN');
        }

        if (!shouldCollect && collector.current) {
          await stopActivityCollector();
        }

        if (shouldCaptureScreenshots && !screenshotService.current) {
          device = device ?? (await deviceService.register());
          if (disposed) return;
          const nextScreenshotService = new ScreenshotService(
            device,
            summary.latestSession?.id ?? null,
          );
          screenshotService.current = nextScreenshotService;
          await nextScreenshotService.start();
        }

        if (!shouldCaptureScreenshots && screenshotService.current) {
          await stopScreenshotService();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('[Esta Desktop] Monitoring lifecycle check failed', error);
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
      void stopScreenshotService();
    };
  }, [user]);

  async function stopActivityCollector(): Promise<void> {
    const activeCollector = collector.current;
    collector.current = null;
    await activeCollector?.stop();
  }

  async function stopScreenshotService(): Promise<void> {
    const activeScreenshotService = screenshotService.current;
    screenshotService.current = null;
    await activeScreenshotService?.stop();
  }

  async function signOut(): Promise<void> {
    await stopActivityCollector();
    await stopScreenshotService();
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
