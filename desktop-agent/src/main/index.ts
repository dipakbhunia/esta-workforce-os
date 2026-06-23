import { app, BrowserWindow, Menu, shell } from 'electron';
import { join } from 'node:path';
import type { DesktopSettings } from '../shared/contracts';
import { DeviceIdentity } from './device/device-identity';
import { registerIpcHandlers } from './ipc/register-ipc';
import { JsonFileStore } from './storage/json-file-store';
import { SecureTokenStore } from './storage/secure-token-store';

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 390,
    height: 690,
    minWidth: 360,
    maxWidth: 430,
    minHeight: 620,
    maxHeight: 760,
    resizable: true,
    show: false,
    backgroundColor: '#f4f4f2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
  Menu.setApplicationMenu(null);

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
