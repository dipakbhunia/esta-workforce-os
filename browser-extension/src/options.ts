import { savePairingConfig } from './storage.js';
import type { PairingConfig } from './types.js';

const portInput = document.querySelector<HTMLInputElement>('#port');
const tokenInput = document.querySelector<HTMLInputElement>('#token');
const saveButton = document.querySelector<HTMLButtonElement>('#save');
const testButton = document.querySelector<HTMLButtonElement>('#test');
const statusBox = document.querySelector<HTMLElement>('#status');

saveButton?.addEventListener('click', () => {
  void save();
});

testButton?.addEventListener('click', () => {
  void testConnection();
});

async function save(): Promise<void> {
  const config = readConfig();
  if (!config) {
    setStatus('Not connected: enter a valid port and pairing token.');
    return;
  }
  await savePairingConfig(config);
  setStatus('Pairing saved. Test the connection while the desktop agent is running.');
}

async function testConnection(): Promise<void> {
  const config = readConfig();
  if (!config) {
    setStatus('Not connected: enter a valid port and pairing token.');
    return;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/v1/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) throw new Error(`Bridge status failed: ${response.status}`);
    await savePairingConfig(config);
    setStatus('Connected. Hostname bridge is authenticated.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message.includes('401')
      ? 'Authentication failed. Check the pairing token.'
      : 'Desktop agent unavailable. Start the desktop app and try again.');
  }
}

function readConfig(): PairingConfig | null {
  const port = Number(portInput?.value);
  const token = tokenInput?.value.trim() ?? '';
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || token.length < 16) {
    return null;
  }
  return { port, token };
}

function setStatus(value: string): void {
  if (statusBox) statusBox.textContent = value;
}
