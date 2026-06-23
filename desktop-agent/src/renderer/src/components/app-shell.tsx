import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onSettings = location.pathname === '/settings';

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
          aria-label={onSettings ? 'Back to attendance' : 'Open settings'}
        >
          {onSettings ? '←' : '⚙'}
        </Link>
      </header>
      <main className="agent-content">
        <Outlet />
      </main>
      <footer className="agent-footer">
        <button className="sign-out-button" onClick={() => void logout()}>
          Sign out
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
