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
    <section className="compact-page">
      <div className="section-heading">
        <p className="eyebrow">Info</p>
        <h2>Settings</h2>
      </div>
      <div className="info-panel">
        <label className="field">
          Backend API
          <input value={environment.apiBaseUrl} disabled />
        </label>
        <label className="field">
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
