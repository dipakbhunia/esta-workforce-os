import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

export function AppShell() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Esta</p>
          <h1>Workforce OS</h1>
        </div>
        <nav>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span>{user?.email}</span>
          <button className="link-button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
