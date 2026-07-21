import type { PairingConfig } from './types.js';

const configKey = 'estaBridgeConfig';

export function getPairingConfig(): Promise<PairingConfig | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([configKey], (items) => {
      const value = items[configKey] as Partial<PairingConfig> | undefined;
      if (
        value &&
        typeof value.port === 'number' &&
        Number.isInteger(value.port) &&
        value.port > 0 &&
        value.port <= 65535 &&
        typeof value.token === 'string' &&
        value.token.length >= 16
      ) {
        resolve({ port: value.port, token: value.token });
        return;
      }
      resolve(null);
    });
  });
}

export function savePairingConfig(config: PairingConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [configKey]: config }, () => resolve());
  });
}
