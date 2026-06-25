import { Info as CircleInfo } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  DesktopSettings,
  DeviceInformation,
} from '@shared/contracts';
import { environment } from '../config/environment';

export function SettingsPage() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [device, setDevice] = useState<DeviceInformation | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.esta.settings.get(),
      window.esta.device.getInformation(),
    ]).then(([loadedSettings, information]) => {
      setSettings(loadedSettings);
      setDevice(information);
    });
  }, []);

  async function save() {
    if (!settings) return;
    setSettings(await window.esta.settings.update(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="compact-page settings-page">
      <div className="section-heading">
        <p className="eyebrow heading-with-icon">
          <CircleInfo size={18} strokeWidth={2.2} aria-hidden="true" />
          Info
        </p>
        <h2>Settings</h2>
      </div>
      <div className="info-panel">
        <label className="field">
          Backend API
          <input value={environment.apiBaseUrl} disabled />
        </label>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={settings?.startWithWindows ?? true}
            onChange={(event) =>
              setSettings((current) => ({
                ...(current ?? defaultSettings()),
                startWithWindows: event.target.checked,
              }))
            }
          />
          <span>Start app with Windows</span>
        </label>
        <label className="field">
          Heartbeat interval (milliseconds)
          <input
            type="number"
            min={15000}
            value={settings?.heartbeatIntervalMs ?? 60000}
            onChange={(event) =>
              setSettings((current) => ({
                ...(current ?? defaultSettings()),
                heartbeatIntervalMs: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="field">
          Idle auto punch-out timeout (minutes)
          <input
            type="number"
            min={1}
            value={Math.round((settings?.idleTimeoutMs ?? 300000) / 60000)}
            onChange={(event) =>
              setSettings((current) => ({
                ...(current ?? defaultSettings()),
                idleTimeoutMs: Number(event.target.value) * 60000,
              }))
            }
          />
        </label>
        <p className="muted setting-note">
          Idle detection uses OS-level aggregate idle time from Electron powerMonitor.
          It does not read typed keys, mouse coordinates, screenshots, apps, or websites.
          TODO: Replace this local timeout with a company-wise idle timeout policy from the backend.
          TODO: Review macOS permissions during packaging hardening if needed.
        </p>
        <button className="small-action" onClick={() => void save()}>
          Save
        </button>
        {saved && <span className="success">Saved</span>}
      </div>
      <div className="info-panel">
        <h3>Device</h3>
        <dl className="compact-dl">
          <dt>ID</dt>
          <dd>{device?.identifier ?? 'Loading...'}</dd>
          <dt>Platform</dt>
          <dd>{device ? `${device.platform} ${device.osVersion}` : 'Loading...'}</dd>
          <dt>Arch</dt>
          <dd>{device?.architecture ?? 'Loading...'}</dd>
          <dt>Version</dt>
          <dd>{device?.appVersion ?? 'Loading...'}</dd>
        </dl>
      </div>
    </section>
  );
}

function defaultSettings(): DesktopSettings {
  return {
    heartbeatIntervalMs: 60000,
    idleTimeoutMs: 300000,
    startWithWindows: true,
  };
}
