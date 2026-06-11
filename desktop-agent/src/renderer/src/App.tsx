import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ProtectedRoute } from './components/protected-route';
import { DashboardPage } from './pages/dashboard-page';
import { LoginPage } from './pages/login-page';
import { SettingsPage } from './pages/settings-page';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
