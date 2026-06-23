import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ProtectedRoute } from './components/protected-route';
import { AttendanceHomePage } from './pages/attendance-home-page';
import { BreakActivePage } from './pages/break-active-page';
import { BreakSelectionPage } from './pages/break-selection-page';
import { LoginPage } from './pages/login-page';
import { SettingsPage } from './pages/settings-page';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<AttendanceHomePage />} />
            <Route path="break" element={<BreakSelectionPage />} />
            <Route path="break-active" element={<BreakActivePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
