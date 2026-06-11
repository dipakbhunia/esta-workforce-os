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
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Local configuration</p>
          <h2>Settings</h2>
        </div>
      </header>
      <div className="settings-card">
        <label>
          Backend API
          <input value={environment.apiBaseUrl} disabled />
        </label>
        <label>
          Future heartbeat interval (milliseconds)
          <input
            type="number"
            min={15000}
            value={settings?.heartbeatIntervalMs ?? 60000}
            onChange={(event) =>
              setSettings({
                heartbeatIntervalMs: Number(event.target.value),
              })
            }
          />
        </label>
        <button className="primary" onClick={() => void save()}>
          Save local settings
        </button>
        {saved && <span className="success">Saved</span>}
      </div>
      <div className="settings-card">
        <h3>Device information</h3>
        <dl>
          <dt>Identifier</dt>
          <dd>{device?.identifier ?? 'Loading...'}</dd>
          <dt>Platform</dt>
          <dd>{device ? `${device.platform} ${device.osVersion}` : 'Loading...'}</dd>
          <dt>Architecture</dt>
          <dd>{device?.architecture ?? 'Loading...'}</dd>
          <dt>Agent version</dt>
          <dd>{device?.appVersion ?? 'Loading...'}</dd>
        </dl>
      </div>
    </section>
  );
}
