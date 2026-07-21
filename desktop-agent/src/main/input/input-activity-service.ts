import type { InputActivitySnapshot } from '../../shared/contracts';
import type { InputActivityProvider } from './input-activity-provider';
import { zeroInputActivitySnapshot } from './input-activity-provider';
import { UnsupportedInputActivityProvider } from './unsupported-input-activity-provider';
import { WindowsInputActivityProvider } from './windows-input-activity-provider';

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export class InputActivityService {
  private readonly provider: InputActivityProvider;
  private readonly providerName: string;
  private enabled = false;

  constructor() {
    const trackingEnabled = booleanFromEnv('VITE_INPUT_TRACKING_ENABLED', true);
    if (trackingEnabled && process.platform === 'win32') {
      this.providerName = 'windows_global_hooks';
      this.provider = new WindowsInputActivityProvider({
            mouseMoveEnabled: booleanFromEnv('VITE_INPUT_MOUSE_MOVE_ENABLED', true),
            scrollEnabled: booleanFromEnv('VITE_INPUT_SCROLL_ENABLED', true),
            mouseMoveThrottleMs: numberFromEnv('VITE_INPUT_MOUSE_MOVE_THROTTLE_MS', 500),
          });
    } else {
      this.providerName = trackingEnabled ? 'unsupported_platform' : 'disabled_by_env';
      this.provider = new UnsupportedInputActivityProvider();
    }
  }

  async start(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    await this.provider.start();
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Input activity collector started', {
        provider: this.providerName,
        platform: process.platform,
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;
    await this.provider.stop();
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Input activity collector stopped', {
        provider: this.providerName,
      });
    }
  }

  async snapshotAndReset(): Promise<InputActivitySnapshot> {
    if (!this.enabled) return zeroInputActivitySnapshot();
    const snapshot = await this.provider.snapshotAndReset();
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Esta Desktop] Input activity snapshot before session flush', snapshot);
    }
    return snapshot;
  }
}
