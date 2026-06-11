import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { DesktopSettings } from '../shared/contracts';
import { DeviceIdentity } from './device/device-identity';
import { registerIpcHandlers } from './ipc/register-ipc';
import { JsonFileStore } from './storage/json-file-store';
import { SecureTokenStore } from './storage/secure-token-store';

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f3f6fb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

app.whenReady().then(() => {
  const dataDirectory = app.getPath('userData');
  const tokenStore = new SecureTokenStore(
    new JsonFileStore(join(dataDirectory, 'auth.json'), {}),
  );
  const deviceIdentity = new DeviceIdentity(
    new JsonFileStore(join(dataDirectory, 'device.json'), {}),
  );
  const settings = new JsonFileStore<DesktopSettings>(
    join(dataDirectory, 'settings.json'),
    { heartbeatIntervalMs: 60000 },
  );
  registerIpcHandlers(tokenStore, deviceIdentity, settings);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
