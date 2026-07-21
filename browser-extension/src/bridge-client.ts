import type { BridgeMessage, PairingConfig } from './types.js';

const timeoutMs = 2000;

export async function sendHostnameToDesktop(config: PairingConfig, message: BridgeMessage): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/v1/browser/active-tab`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Bridge rejected hostname: ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
