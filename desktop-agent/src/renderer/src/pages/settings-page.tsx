import { Copy, Eye, EyeOff, Info as CircleInfo, RefreshCw, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  BrowserBridgePairingInfo,
  BrowserBridgeState,
  DesktopSettings,
  DeviceInformation,
} from '@shared/contracts';
import { environment } from '../config/environment';

export function SettingsPage() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [device, setDevice] = useState<DeviceInformation | null>(null);
  const [bridge, setBridge] = useState<BrowserBridgePairingInfo | null>(null);
  const [bridgeState, setBridgeState] = useState<BrowserBridgeState | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.esta.settings.get(),
      window.esta.device.getInformation(),
      window.esta.browserBridge.getPairingInfo(),
      window.esta.browserBridge.getLatestState(),
    ]).then(([loadedSettings, information, pairingInfo, latestState]) => {
      setSettings(loadedSettings);
      setDevice(information);
      setBridge(pairingInfo);
      setBridgeState(latestState);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void window.esta.browserBridge.getLatestState().then(setBridgeState);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function save() {
    if (!settings) return;
    setSettings(await window.esta.settings.update(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  async function copyToken() {
    if (!bridge?.token) return;
    await navigator.clipboard.writeText(bridge.token);
    setBridgeMessage('Pairing token copied.');
    window.setTimeout(() => setBridgeMessage(null), 1800);
  }

  async function regenerateToken() {
    const next = await window.esta.browserBridge.regeneratePairingToken();
    setBridge(next);
    setBridgeState(null);
    setShowToken(false);
    setBridgeMessage('New pairing token generated. Update the browser extension.');
    window.setTimeout(() => setBridgeMessage(null), 2600);
  }

  async function testBrowserConnection() {
    const latest = await window.esta.browserBridge.getLatestState();
    setBridgeState(latest);
    setBridgeMessage(
      latest
        ? `Connected: ${latest.browser} reported ${latest.hostname}.`
        : 'Waiting for browser extension connection.',
    );
    window.setTimeout(() => setBridgeMessage(null), 2600);
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
      <div className="info-panel browser-integration-panel">
        <div className="panel-title-row">
          <h3 className="heading-with-icon">
            <Wifi size={18} strokeWidth={2.2} aria-hidden="true" />
            Browser Integration
          </h3>
          <span className={bridge ? 'success' : 'muted'}>
            {bridge ? 'Bridge running' : 'Bridge unavailable'}
          </span>
        </div>
        <p className="muted setting-note">
          Pair the Chromium browser extension with this desktop agent. The bridge accepts only
          hostname-only website events from localhost and never exposes backend JWT or refresh tokens.
        </p>
        <dl className="compact-dl">
          <dt>Status</dt>
          <dd>{bridgeState ? `Connected to ${bridgeState.browser}` : 'Not connected'}</dd>
          <dt>Localhost Port</dt>
          <dd>{bridge?.port ?? 'Unavailable'}</dd>
          <dt>Last Hostname</dt>
          <dd>{bridgeState ? `${bridgeState.hostname} at ${formatTime(bridgeState.receivedAt)}` : 'No hostname received yet'}</dd>
          <dt>Token Expires</dt>
          <dd>{bridge ? formatTime(bridge.expiresAt) : 'Unavailable'}</dd>
        </dl>
        <label className="field">
          Pairing Token
          <div className="token-row">
            <input
              value={bridge ? (showToken ? bridge.token : maskToken(bridge.token)) : 'Unavailable'}
              readOnly
              aria-label="Browser extension pairing token"
            />
            <button
              className="icon-inline-button"
              type="button"
              onClick={() => setShowToken((current) => !current)}
              aria-label={showToken ? 'Hide pairing token' : 'Show pairing token'}
              title={showToken ? 'Hide pairing token' : 'Show pairing token'}
              disabled={!bridge}
            >
              {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <div className="settings-actions">
          <button className="small-action" onClick={() => void copyToken()} disabled={!bridge}>
            <Copy size={16} strokeWidth={2.2} aria-hidden="true" />
            Copy Token
          </button>
          <button className="small-action" onClick={() => void regenerateToken()} disabled={!bridge}>
            <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
            Regenerate Token
          </button>
          <button className="small-action" onClick={() => void testBrowserConnection()}>
            Test Connection
          </button>
        </div>
        {bridgeMessage && <span className="success">{bridgeMessage}</span>}
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

function maskToken(token: string): string {
  if (token.length <= 10) return '********';
  return `${token.slice(0, 4)}************${token.slice(-4)}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}
